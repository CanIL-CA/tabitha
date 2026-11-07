import { describe, expect, it } from 'bun:test'
import { apply_automation_action, apply_policy_action, list_automations, list_policies, parse_alert_emails, plan_automations, plan_policies, type LiveAutomation, type LivePolicy } from './apply'
import type { DesiredAutomation, DesiredPolicy } from './config'

const credentials = { account_id: 'account-1', api_token: 'token-1' }

const desired_policy: DesiredPolicy = {
	name: 'Worker issues (tools/alerts)',
	description: 'Emails on Worker failures.',
	alert_type: 'workers_observability_real_time_issue',
}

const live_policy: LivePolicy = {
	id: 'policy-1',
	name: desired_policy.name,
	description: desired_policy.description,
	alert_type: desired_policy.alert_type,
	enabled: true,
	mechanisms: { email: [{ id: 'someone@example.org' }] },
}

const budget_alert: LivePolicy = {
	id: 'budget-1',
	name: 'Default budget alert (auto-created)',
	alert_type: 'billing_budget_alert',
	enabled: true,
	mechanisms: { email: [{ id: 'billing@example.org' }] },
}

const new_issue: DesiredAutomation = { name: 'New Worker issue', policy_name: desired_policy.name, trigger: { after_occurrences: 1 } }
const recurring_issue: DesiredAutomation = { name: 'Worker issue back', policy_name: desired_policy.name, trigger: { after_inactivity_seconds: 86_400 } }

const live_new_issue: LiveAutomation = { id: 'auto-1', name: new_issue.name, enabled: true, ansPolicyId: 'policy-1', scope: 'account', threshold: 1, inactivitySeconds: null }
const live_recurring_issue: LiveAutomation = { id: 'auto-2', name: recurring_issue.name, enabled: true, ansPolicyId: 'policy-1', scope: 'account', threshold: null, inactivitySeconds: 86_400 }

const policy_ids = new Map([[desired_policy.name, 'policy-1']])

type RecordedRequest = { url: URL; method: string; headers: Headers; body: unknown }

function recording_fetch({ respond }: { respond: (request: RecordedRequest) => Response }) {
	const requests: RecordedRequest[] = []
	const fetch_impl = (async (input: string, init?: RequestInit) => {
		const request = {
			url: new URL(input),
			method: init?.method ?? 'GET',
			headers: new Headers(init?.headers),
			body: init?.body ? JSON.parse(init.body as string) : undefined,
		}
		requests.push(request)
		return respond(request)
	}) as typeof fetch
	return { fetch_impl, requests }
}

const ok = () => Response.json({ success: true, result: {} })

describe('plan_policies', () => {
	it('creates a desired policy that has no live counterpart', () => {
		expect(plan_policies({ desired: [desired_policy], live: [budget_alert] })).toEqual([{ kind: 'create', desired: desired_policy }])
	})

	it('leaves a matching policy unchanged whoever its recipients are, since those are managed in the dashboard', () => {
		const other_recipients = { ...live_policy, mechanisms: { email: [{ id: 'a@example.org' }, { id: 'b@example.org' }] } }

		expect(plan_policies({ desired: [desired_policy], live: [other_recipients] })).toEqual([{ kind: 'unchanged', desired: desired_policy }])
	})

	it('updates a live policy whose description, type or enabled state differs', () => {
		const drifted: LivePolicy[] = [
			{ ...live_policy, description: 'edited in the dashboard' },
			{ ...live_policy, alert_type: 'workers_observability_alert' },
			{ ...live_policy, enabled: false },
		]

		for (const existing of drifted) {
			expect(plan_policies({ desired: [desired_policy], live: [existing] })).toEqual([{ kind: 'update', desired: desired_policy, existing }])
		}
	})

	it('reports a name shared by several live policies as ambiguous instead of picking one', () => {
		const live = [live_policy, { ...live_policy, id: 'policy-2' }]

		expect(plan_policies({ desired: [desired_policy], live })).toEqual([{ kind: 'ambiguous', desired: desired_policy }])
	})

	it('plans nothing for live policies it does not declare', () => {
		expect(plan_policies({ desired: [], live: [budget_alert] })).toEqual([])
	})
})

describe('plan_automations', () => {
	it('creates automations that have no live counterpart', () => {
		expect(plan_automations({ desired: [new_issue, recurring_issue], live: [], policy_ids })).toEqual([
			{ kind: 'create', desired: new_issue },
			{ kind: 'create', desired: recurring_issue },
		])
	})

	it('leaves account-wide automations with the right trigger and policy unchanged', () => {
		expect(plan_automations({ desired: [new_issue, recurring_issue], live: [live_new_issue, live_recurring_issue], policy_ids })).toEqual([
			{ kind: 'unchanged', desired: new_issue },
			{ kind: 'unchanged', desired: recurring_issue },
		])
	})

	it('updates an automation whose trigger, policy, scope or enabled state differs', () => {
		const drifted: LiveAutomation[] = [
			{ ...live_new_issue, threshold: 5 },
			{ ...live_new_issue, threshold: null, inactivitySeconds: 3600 },
			{ ...live_new_issue, ansPolicyId: 'some-other-policy' },
			{ ...live_new_issue, scope: 'service' },
			{ ...live_new_issue, enabled: false },
		]

		for (const existing of drifted) {
			expect(plan_automations({ desired: [new_issue], live: [existing], policy_ids })).toEqual([{ kind: 'update', desired: new_issue, existing }])
		}
	})

	it('plans a create when its policy has no id yet, as on a dry run before the policy exists', () => {
		expect(plan_automations({ desired: [new_issue], live: [], policy_ids: new Map() })).toEqual([{ kind: 'create', desired: new_issue }])
	})

	it('reports a name shared by several live automations as ambiguous', () => {
		const live = [live_new_issue, { ...live_new_issue, id: 'auto-9' }]

		expect(plan_automations({ desired: [new_issue], live, policy_ids })).toEqual([{ kind: 'ambiguous', desired: new_issue }])
	})
})

describe('parse_alert_emails', () => {
	it('splits a comma-separated list and ignores blanks', () => {
		expect(parse_alert_emails(' a@example.org, ,b@example.org ,')).toEqual(['a@example.org', 'b@example.org'])
	})

	it('returns no recipients when the variable is unset or blank', () => {
		expect(parse_alert_emails(undefined)).toEqual([])
		expect(parse_alert_emails('')).toEqual([])
	})
})

describe('list_policies', () => {
	it("returns the account's live policies", async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: () => Response.json({ success: true, result: [budget_alert] }) })

		expect(await list_policies({ credentials, fetch_impl })).toEqual([budget_alert])
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/alerting/v3/policies')
		expect(requests[0].headers.get('authorization')).toBe('Bearer token-1')
	})

	it('throws with the status and body when the listing fails', async () => {
		const { fetch_impl } = recording_fetch({ respond: () => new Response('Authentication error', { status: 403 }) })

		await expect(list_policies({ credentials, fetch_impl })).rejects.toThrow(/403 Authentication error/)
	})
})

describe('list_automations', () => {
	it("returns the account's live automations", async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: () => Response.json({ success: true, result: { automations: [live_new_issue] } }) })

		expect(await list_automations({ credentials, fetch_impl })).toEqual([live_new_issue])
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/workers/observability/issues/automations')
	})

	it('throws with the status and body when the listing fails', async () => {
		const { fetch_impl } = recording_fetch({ respond: () => new Response('missing permission', { status: 403 }) })

		await expect(list_automations({ credentials, fetch_impl })).rejects.toThrow(/403 missing permission/)
	})
})

describe('apply_policy_action', () => {
	it('creates a policy with the seed recipients as its email destinations', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await apply_policy_action({ credentials, action: { kind: 'create', desired: desired_policy }, seed_emails: ['a@example.org', 'b@example.org'], fetch_impl })

		expect(requests).toHaveLength(1)
		expect(requests[0].method).toBe('POST')
		expect(requests[0].url.origin).toBe('https://api.cloudflare.com')
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/alerting/v3/policies')
		expect(requests[0].body).toEqual({
			name: desired_policy.name,
			description: desired_policy.description,
			alert_type: desired_policy.alert_type,
			enabled: true,
			mechanisms: { email: [{ id: 'a@example.org' }, { id: 'b@example.org' }] },
			filters: {},
		})
	})

	it('refuses to create a policy without seed recipients, and sends nothing', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await expect(apply_policy_action({ credentials, action: { kind: 'create', desired: desired_policy }, seed_emails: [], fetch_impl })).rejects.toThrow(/ALERT_EMAILS/)
		expect(requests).toEqual([])
	})

	it('keeps the live recipients when it replaces a drifted policy', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })
		const existing = { ...live_policy, description: 'edited in the dashboard' }

		await apply_policy_action({ credentials, action: { kind: 'update', desired: desired_policy, existing }, seed_emails: ['ignored@example.org'], fetch_impl })

		expect(requests[0].method).toBe('PUT')
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/alerting/v3/policies/policy-1')
		expect(requests[0].body).toMatchObject({ description: desired_policy.description, mechanisms: live_policy.mechanisms })
	})

	it('sends nothing for an unchanged or ambiguous policy', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await apply_policy_action({ credentials, action: { kind: 'unchanged', desired: desired_policy }, seed_emails: [], fetch_impl })
		await apply_policy_action({ credentials, action: { kind: 'ambiguous', desired: desired_policy }, seed_emails: [], fetch_impl })

		expect(requests).toEqual([])
	})

	it('throws with the status and body when Cloudflare rejects the write', async () => {
		const { fetch_impl } = recording_fetch({ respond: () => new Response('bad mechanism', { status: 400 }) })

		await expect(apply_policy_action({ credentials, action: { kind: 'create', desired: desired_policy }, seed_emails: ['a@example.org'], fetch_impl })).rejects.toThrow(/create policy "Worker issues \(tools\/alerts\)": 400 bad mechanism/)
	})
})

describe('apply_automation_action', () => {
	it('creates an occurrence-threshold automation pointing at its policy', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await apply_automation_action({ credentials, action: { kind: 'create', desired: new_issue }, policy_ids, fetch_impl })

		expect(requests[0].method).toBe('POST')
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/workers/observability/issues/automations')
		expect(requests[0].body).toEqual({ name: new_issue.name, policyId: 'policy-1', enabled: true, afterOccurrences: 1 })
	})

	it('creates a recurrence automation with only the inactivity period', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await apply_automation_action({ credentials, action: { kind: 'create', desired: recurring_issue }, policy_ids, fetch_impl })

		expect(requests[0].body).toEqual({ name: recurring_issue.name, policyId: 'policy-1', enabled: true, afterInactivitySeconds: 86_400 })
	})

	it('replaces a drifted automation by id', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await apply_automation_action({ credentials, action: { kind: 'update', desired: new_issue, existing: { ...live_new_issue, threshold: 5 } }, policy_ids, fetch_impl })

		expect(requests[0].method).toBe('PUT')
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/workers/observability/issues/automations/auto-1')
	})

	it('throws, and sends nothing, when its policy does not exist', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await expect(apply_automation_action({ credentials, action: { kind: 'create', desired: new_issue }, policy_ids: new Map(), fetch_impl })).rejects.toThrow(/names policy "Worker issues \(tools\/alerts\)"/)
		expect(requests).toEqual([])
	})

	it('sends nothing for an unchanged or ambiguous automation', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: ok })

		await apply_automation_action({ credentials, action: { kind: 'unchanged', desired: new_issue }, policy_ids, fetch_impl })
		await apply_automation_action({ credentials, action: { kind: 'ambiguous', desired: new_issue }, policy_ids, fetch_impl })

		expect(requests).toEqual([])
	})
})
