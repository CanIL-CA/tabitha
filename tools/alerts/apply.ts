import { desired_automations, desired_policies, type AutomationTrigger, type DesiredAutomation, type DesiredPolicy } from './config'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

export type CloudflareCredentials = {
	account_id: string
	api_token: string
}

/** Who a policy notifies, keyed by delivery method (`email`, `webhooks`, ...). */
type Mechanisms = Record<string, Array<{ id: string }>>

/** Cloudflare's notification policy shape, trimmed to the fields this tool reads or writes. */
export type LivePolicy = {
	id: string
	name: string
	description?: string
	alert_type: string
	enabled: boolean
	mechanisms: Mechanisms
}

/** Cloudflare's Workers Issues automation shape, trimmed to the fields this tool reads. */
export type LiveAutomation = {
	id: string
	name: string
	enabled: boolean
	ansPolicyId: string
	scope: 'account' | 'service'
	threshold: number | null
	inactivitySeconds: number | null
}

export type Action<Desired, Live> =
	| { kind: 'create'; desired: Desired }
	| { kind: 'update'; desired: Desired; existing: Live }
	| { kind: 'unchanged'; desired: Desired }
	| { kind: 'ambiguous'; desired: Desired }

/** Decides what each desired item needs. Live items that no desired item names are never returned,
 * so everything else in the account (the budget alert, anything made by hand) is left alone. */
function plan_by_name<Desired extends { name: string }, Live extends { name: string }>({ desired, live, matches_desired }: {
	desired: Desired[]
	live: Live[]
	matches_desired: (pair: { existing: Live; wanted: Desired }) => boolean
}): Action<Desired, Live>[] {
	return desired.map(wanted => {
		const matches = live.filter(existing => existing.name === wanted.name)
		if (matches.length > 1) return { kind: 'ambiguous', desired: wanted }

		const [existing] = matches
		if (!existing) return { kind: 'create', desired: wanted }
		if (matches_desired({ existing, wanted })) return { kind: 'unchanged', desired: wanted }
		return { kind: 'update', desired: wanted, existing }
	})
}

/** Recipients are never compared: they're managed in the dashboard, not here. */
export function plan_policies({ desired, live }: {
	desired: DesiredPolicy[]
	live: LivePolicy[]
}): Action<DesiredPolicy, LivePolicy>[] {
	return plan_by_name({
		desired,
		live,
		matches_desired: ({ existing, wanted }) => existing.enabled && existing.alert_type === wanted.alert_type && (existing.description ?? '') === wanted.description,
	})
}

/** `policy_ids` maps each policy name to its live id. A policy that doesn't exist yet (a dry run
 * before its first apply) has no id, so its automations plan as creates. */
export function plan_automations({ desired, live, policy_ids }: {
	desired: DesiredAutomation[]
	live: LiveAutomation[]
	policy_ids: Map<string, string>
}): Action<DesiredAutomation, LiveAutomation>[] {
	return plan_by_name({
		desired,
		live,
		matches_desired: ({ existing, wanted }) => automation_matches({ existing, wanted, policy_id: policy_ids.get(wanted.policy_name) }),
	})
}

function automation_matches({ existing, wanted, policy_id }: {
	existing: LiveAutomation
	wanted: DesiredAutomation
	policy_id: string | undefined
}): boolean {
	const { threshold, inactivity_seconds } = trigger_fields(wanted.trigger)
	return (
		existing.enabled &&
		existing.scope === 'account' &&
		existing.ansPolicyId === policy_id &&
		existing.threshold === threshold &&
		existing.inactivitySeconds === inactivity_seconds
	)
}

function trigger_fields(trigger: AutomationTrigger): { threshold: number | null; inactivity_seconds: number | null } {
	if ('after_occurrences' in trigger) return { threshold: trigger.after_occurrences, inactivity_seconds: null }
	return { threshold: null, inactivity_seconds: trigger.after_inactivity_seconds }
}

/** `ALERT_EMAILS` is a comma-separated list; blanks around and between entries are ignored. */
export function parse_alert_emails(value: string | undefined): string[] {
	return (value ?? '').split(',').map(email => email.trim()).filter(Boolean)
}

function policy_request_body({ policy, mechanisms }: {
	policy: DesiredPolicy
	mechanisms: Mechanisms
}) {
	return {
		name: policy.name,
		description: policy.description,
		alert_type: policy.alert_type,
		enabled: true,
		mechanisms,
		filters: {},
	}
}

function automation_request_body({ automation, policy_id }: {
	automation: DesiredAutomation
	policy_id: string
}) {
	const { threshold, inactivity_seconds } = trigger_fields(automation.trigger)
	return {
		name: automation.name,
		policyId: policy_id,
		enabled: true,
		...threshold === null ? { afterInactivitySeconds: inactivity_seconds } : { afterOccurrences: threshold },
	}
}

export async function list_policies({ credentials: { account_id, api_token }, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	fetch_impl?: typeof fetch
}): Promise<LivePolicy[]> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/accounts/${account_id}/alerting/v3/policies`, { headers: auth_headers(api_token) })
	if (!response.ok) throw new Error(`Failed to list notification policies: ${response.status} ${await response.text()}`)

	const body = (await response.json()) as { result: LivePolicy[] }
	return body.result
}

export async function list_automations({ credentials: { account_id, api_token }, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	fetch_impl?: typeof fetch
}): Promise<LiveAutomation[]> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/accounts/${account_id}/workers/observability/issues/automations`, { headers: auth_headers(api_token) })
	if (!response.ok) throw new Error(`Failed to list issue automations: ${response.status} ${await response.text()}`)

	const body = (await response.json()) as { result: { automations: LiveAutomation[] } }
	return body.result.automations
}

/** A create seeds recipients from `seed_emails`; an update keeps the live policy's recipients, since
 * Cloudflare's PUT replaces the whole policy and recipients are edited in the dashboard. */
export async function apply_policy_action({ credentials: { account_id, api_token }, action, seed_emails, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	action: Action<DesiredPolicy, LivePolicy>
	seed_emails: string[]
	fetch_impl?: typeof fetch
}): Promise<void> {
	const base = `${CLOUDFLARE_API_BASE}/accounts/${account_id}/alerting/v3/policies`

	if (action.kind === 'create') {
		if (seed_emails.length === 0) throw new Error(`Policy "${action.desired.name}" doesn't exist yet. Set ALERT_EMAILS in tools/alerts/.env.local to its first recipients.`)
		const mechanisms = { email: seed_emails.map(email => ({ id: email })) }
		await send_write({ url: base, method: 'POST', api_token, body: policy_request_body({ policy: action.desired, mechanisms }), failure: `Failed to create policy "${action.desired.name}"`, fetch_impl })
	}

	if (action.kind === 'update') {
		const body = policy_request_body({ policy: action.desired, mechanisms: action.existing.mechanisms })
		await send_write({ url: `${base}/${action.existing.id}`, method: 'PUT', api_token, body, failure: `Failed to update policy "${action.desired.name}"`, fetch_impl })
	}
}

export async function apply_automation_action({ credentials: { account_id, api_token }, action, policy_ids, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	action: Action<DesiredAutomation, LiveAutomation>
	policy_ids: Map<string, string>
	fetch_impl?: typeof fetch
}): Promise<void> {
	if (action.kind !== 'create' && action.kind !== 'update') return

	const policy_id = policy_ids.get(action.desired.policy_name)
	if (!policy_id) throw new Error(`Automation "${action.desired.name}" names policy "${action.desired.policy_name}", which doesn't exist in the account.`)

	const base = `${CLOUDFLARE_API_BASE}/accounts/${account_id}/workers/observability/issues/automations`
	await send_write({
		url: action.kind === 'update' ? `${base}/${action.existing.id}` : base,
		method: action.kind === 'create' ? 'POST' : 'PUT',
		api_token,
		body: automation_request_body({ automation: action.desired, policy_id }),
		failure: `Failed to ${action.kind} automation "${action.desired.name}"`,
		fetch_impl,
	})
}

async function send_write({ url, method, api_token, body, failure, fetch_impl }: {
	url: string
	method: 'POST' | 'PUT'
	api_token: string
	body: unknown
	failure: string
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(url, { method, headers: auth_headers(api_token), body: JSON.stringify(body) })
	if (!response.ok) throw new Error(`${failure}: ${response.status} ${await response.text()}`)
}

function auth_headers(api_token: string): HeadersInit {
	return {
		'Authorization': `Bearer ${api_token}`,
		'Content-Type': 'application/json',
	}
}

const AMBIGUOUS_LABEL = '⚠️ more than one live item has this name -- left untouched, resolve by hand'
const ACTION_LABELS: Record<Action<unknown, unknown>['kind'], { plan: string; done: string }> = {
	create: { plan: 'would create', done: 'created' },
	update: { plan: 'would update', done: 'updated' },
	unchanged: { plan: 'unchanged', done: 'unchanged' },
	ambiguous: { plan: AMBIGUOUS_LABEL, done: AMBIGUOUS_LABEL },
}

function report({ heading, action, should_apply }: {
	heading: string
	action: Action<{ name: string }, unknown>
	should_apply: boolean
}): void {
	const label = ACTION_LABELS[action.kind]
	console.log(`${heading} ${action.desired.name}: ${should_apply ? label.done : label.plan}`)
}

function is_write({ kind }: Action<unknown, unknown>): boolean {
	return kind === 'create' || kind === 'update'
}

if (import.meta.main) {
	const should_apply = process.argv.includes('--run')
	const credentials = {
		account_id: require_env('CLOUDFLARE_ACCOUNT_ID'),
		api_token: require_env('CLOUDFLARE_API_TOKEN'),
	}
	const seed_emails = parse_alert_emails(process.env.ALERT_EMAILS)

	const policy_actions = plan_policies({ desired: desired_policies, live: await list_policies({ credentials }) })
	for (const action of policy_actions) {
		if (should_apply) await apply_policy_action({ credentials, action, seed_emails })
		report({ heading: 'Policy', action, should_apply })
	}

	// Re-read after applying, so a policy created just now has an id for its automations to point at.
	const live_policies = await list_policies({ credentials })
	const policy_ids = new Map(live_policies.map(policy => [policy.name, policy.id]))

	const automation_actions = plan_automations({ desired: desired_automations, live: await list_automations({ credentials }), policy_ids })
	for (const action of automation_actions) {
		if (should_apply) await apply_automation_action({ credentials, action, policy_ids })
		report({ heading: 'Automation', action, should_apply })
	}

	if (!should_apply && [...policy_actions, ...automation_actions].some(is_write)) {
		console.log('\nDry run. Run `bun run apply:run` to apply.')
	}
}

function require_env(key: string): string {
	const value = process.env[key]
	if (!value) throw new Error(`Missing required env var "${key}". Set it in tools/alerts/.env.local.`)
	return value
}
