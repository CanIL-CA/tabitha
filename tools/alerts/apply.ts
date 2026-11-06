import { desired_policies, type DesiredPolicy } from './config'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

export type CloudflareCredentials = {
	account_id: string
	api_token: string
}

/** Cloudflare's notification policy shape, trimmed to the fields this tool reads or writes. */
export type LivePolicy = {
	id: string
	name: string
	description?: string
	alert_type: string
	enabled: boolean
	mechanisms: { email?: Array<{ id: string }> }
}

export type PolicyAction =
	| { kind: 'create'; policy: DesiredPolicy }
	| { kind: 'update'; policy: DesiredPolicy; id: string }
	| { kind: 'unchanged'; policy: DesiredPolicy }
	| { kind: 'ambiguous'; policy: DesiredPolicy }

/** Decides what each desired policy needs. Live policies that no desired policy names are never
 * returned, so the account's other policies (the budget alert, anything made by hand) are left alone. */
export function plan_policies({ desired, live }: {
	desired: DesiredPolicy[]
	live: LivePolicy[]
}): PolicyAction[] {
	return desired.map(policy => {
		const matches = live.filter(existing => existing.name === policy.name)
		if (matches.length > 1) return { kind: 'ambiguous', policy }

		const [existing] = matches
		if (!existing) return { kind: 'create', policy }
		if (matches_desired({ existing, policy })) return { kind: 'unchanged', policy }
		return { kind: 'update', policy, id: existing.id }
	})
}

function matches_desired({ existing, policy }: {
	existing: LivePolicy
	policy: DesiredPolicy
}): boolean {
	const live_emails = (existing.mechanisms.email ?? []).map(email => email.id).toSorted()
	const desired_emails = policy.emails.toSorted()
	return (
		existing.enabled &&
		existing.alert_type === policy.alert_type &&
		(existing.description ?? '') === policy.description &&
		JSON.stringify(live_emails) === JSON.stringify(desired_emails)
	)
}

function to_request_body(policy: DesiredPolicy) {
	return {
		name: policy.name,
		description: policy.description,
		alert_type: policy.alert_type,
		enabled: true,
		mechanisms: { email: policy.emails.map(email => ({ id: email })) },
		filters: {},
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

export async function apply_action({ credentials: { account_id, api_token }, action, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	action: PolicyAction
	fetch_impl?: typeof fetch
}): Promise<void> {
	if (action.kind !== 'create' && action.kind !== 'update') return

	const base = `${CLOUDFLARE_API_BASE}/accounts/${account_id}/alerting/v3/policies`
	const request = action.kind === 'create'
		? { url: base, method: 'POST' }
		: { url: `${base}/${action.id}`, method: 'PUT' }

	const response = await fetch_impl(request.url, {
		method: request.method,
		headers: auth_headers(api_token),
		body: JSON.stringify(to_request_body(action.policy)),
	})
	if (!response.ok) throw new Error(`Failed to ${action.kind} policy "${action.policy.name}": ${response.status} ${await response.text()}`)
}

function auth_headers(api_token: string): HeadersInit {
	return {
		'Authorization': `Bearer ${api_token}`,
		'Content-Type': 'application/json',
	}
}

const ACTION_LABELS: Record<PolicyAction['kind'], { plan: string; done: string }> = {
	create: { plan: 'would create', done: 'created' },
	update: { plan: 'would update', done: 'updated' },
	unchanged: { plan: 'unchanged', done: 'unchanged' },
	ambiguous: { plan: '⚠️ more than one live policy has this name -- left untouched, resolve by hand', done: '⚠️ more than one live policy has this name -- left untouched, resolve by hand' },
}

if (import.meta.main) {
	const should_apply = process.argv.includes('--run')
	const credentials = {
		account_id: require_env('CLOUDFLARE_ACCOUNT_ID'),
		api_token: require_env('CLOUDFLARE_API_TOKEN'),
	}

	const actions = plan_policies({ desired: desired_policies, live: await list_policies({ credentials }) })

	for (const action of actions) {
		if (should_apply) await apply_action({ credentials, action })
		const label = ACTION_LABELS[action.kind]
		console.log(`${action.policy.name}: ${should_apply ? label.done : label.plan}`)
	}

	if (!should_apply && actions.some(action => action.kind === 'create' || action.kind === 'update')) {
		console.log('\nDry run. Run `bun run apply:run` to apply.')
	}
}

function require_env(key: string): string {
	const value = process.env[key]
	if (!value) throw new Error(`Missing required env var "${key}". Set it in tools/alerts/.env.local.`)
	return value
}
