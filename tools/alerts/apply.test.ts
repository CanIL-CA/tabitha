import { describe, expect, it } from 'bun:test'
import { apply_action, list_policies, plan_policies, type LivePolicy } from './apply'
import type { DesiredPolicy } from './config'

const credentials = { account_id: 'account-1', api_token: 'token-1' }

const desired: DesiredPolicy = {
	name: 'Worker issues (tools/alerts)',
	description: 'Emails on Worker failures.',
	alert_type: 'workers_observability_real_time_issue',
	emails: ['a@example.org', 'b@example.org'],
}

function live_copy_of(policy: DesiredPolicy): LivePolicy {
	return {
		id: 'policy-1',
		name: policy.name,
		description: policy.description,
		alert_type: policy.alert_type,
		enabled: true,
		mechanisms: { email: policy.emails.map(email => ({ id: email })) },
	}
}

const budget_alert: LivePolicy = {
	id: 'budget-1',
	name: 'Default budget alert (auto-created)',
	alert_type: 'billing_budget_alert',
	enabled: true,
	mechanisms: { email: [{ id: 'someone@example.org' }] },
}

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

describe('plan_policies', () => {
	it('creates a desired policy that has no live counterpart', () => {
		expect(plan_policies({ desired: [desired], live: [budget_alert] })).toEqual([{ kind: 'create', policy: desired }])
	})

	it('leaves a matching live policy unchanged, whatever order its emails are in', () => {
		const live = { ...live_copy_of(desired), mechanisms: { email: [{ id: 'b@example.org' }, { id: 'a@example.org' }] } }

		expect(plan_policies({ desired: [desired], live: [live] })).toEqual([{ kind: 'unchanged', policy: desired }])
	})

	it('updates a live policy whose recipients, description, type or enabled state differ', () => {
		const drifted: LivePolicy[] = [
			{ ...live_copy_of(desired), mechanisms: { email: [{ id: 'a@example.org' }] } },
			{ ...live_copy_of(desired), mechanisms: {} },
			{ ...live_copy_of(desired), description: 'edited in the dashboard' },
			{ ...live_copy_of(desired), alert_type: 'workers_observability_alert' },
			{ ...live_copy_of(desired), enabled: false },
		]

		for (const live of drifted) {
			expect(plan_policies({ desired: [desired], live: [live] })).toEqual([{ kind: 'update', policy: desired, id: 'policy-1' }])
		}
	})

	it('reports a name shared by several live policies as ambiguous instead of picking one', () => {
		const live = [live_copy_of(desired), { ...live_copy_of(desired), id: 'policy-2' }]

		expect(plan_policies({ desired: [desired], live })).toEqual([{ kind: 'ambiguous', policy: desired }])
	})

	it('plans nothing for live policies it does not declare', () => {
		expect(plan_policies({ desired: [], live: [budget_alert] })).toEqual([])
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

describe('apply_action', () => {
	const expected_body = {
		name: desired.name,
		description: desired.description,
		alert_type: desired.alert_type,
		enabled: true,
		mechanisms: { email: [{ id: 'a@example.org' }, { id: 'b@example.org' }] },
		filters: {},
	}

	it('creates a policy with an email destination for each recipient', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: () => Response.json({ success: true, result: { id: 'new' } }) })

		await apply_action({ credentials, action: { kind: 'create', policy: desired }, fetch_impl })

		expect(requests).toHaveLength(1)
		expect(requests[0].method).toBe('POST')
		expect(requests[0].url.origin).toBe('https://api.cloudflare.com')
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/alerting/v3/policies')
		expect(requests[0].body).toEqual(expected_body)
	})

	it('replaces the existing policy by id on update', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: () => Response.json({ success: true, result: { id: 'policy-1' } }) })

		await apply_action({ credentials, action: { kind: 'update', policy: desired, id: 'policy-1' }, fetch_impl })

		expect(requests[0].method).toBe('PUT')
		expect(requests[0].url.pathname).toBe('/client/v4/accounts/account-1/alerting/v3/policies/policy-1')
		expect(requests[0].body).toEqual(expected_body)
	})

	it('sends nothing for an unchanged or ambiguous policy', async () => {
		const { fetch_impl, requests } = recording_fetch({ respond: () => Response.json({ success: true }) })

		await apply_action({ credentials, action: { kind: 'unchanged', policy: desired }, fetch_impl })
		await apply_action({ credentials, action: { kind: 'ambiguous', policy: desired }, fetch_impl })

		expect(requests).toEqual([])
	})

	it('throws with the status and body when Cloudflare rejects the write', async () => {
		const { fetch_impl } = recording_fetch({ respond: () => new Response('bad mechanism', { status: 400 }) })

		await expect(apply_action({ credentials, action: { kind: 'create', policy: desired }, fetch_impl })).rejects.toThrow(/create policy "Worker issues \(tools\/alerts\)": 400 bad mechanism/)
	})
})
