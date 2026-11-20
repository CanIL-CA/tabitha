import { describe, expect, it, mock } from 'bun:test'
import { reconcile_dns } from './apply'
import { desired_block_rules, desired_dns_records, desired_redirect_rules, managed_rule_prefix } from './config'

const credentials = { zone_id: 'zone-1', api_token: 'token-1' }
const [dns_record] = desired_dns_records

function router_fetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
	return mock(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch
}

function managed_rules_as_cloudflare_rules() {
	return desired_redirect_rules.map(rule => ({
		description: `${managed_rule_prefix}${rule.ref}`,
		expression: rule.expression,
		action: 'redirect',
		action_parameters: {
			from_value: { target_url: { expression: rule.target_url_expression }, status_code: rule.status_code, preserve_query_string: rule.preserve_query_string },
		},
		enabled: true,
	}))
}

function managed_block_rules_as_cloudflare_rules() {
	return desired_block_rules.map(rule => ({ description: `${managed_rule_prefix}${rule.ref}`, expression: rule.expression, action: 'block', enabled: true }))
}

function firewall_ruleset_response() {
	return new Response(JSON.stringify({ result: { id: 'firewall-1', rules: managed_block_rules_as_cloudflare_rules() } }), { status: 200 })
}

describe('reconcile_dns', () => {
	it('creates the DNS record and the redirect ruleset when neither exists yet', async () => {
		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') return new Response(JSON.stringify({ result: [] }), { status: 200 })
			if (url.includes('/dns_records') && method === 'POST') return new Response(JSON.stringify({ result: {} }), { status: 200 })
			if (url.includes('/rulesets/phases/') && method === 'GET') return new Response(null, { status: 404 })
			if (url.endsWith('/rulesets') && method === 'POST') return new Response(JSON.stringify({ result: {} }), { status: 200 })
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { dns_results, redirect_status } = await reconcile_dns({ credentials, fetch_impl })

		expect(dns_results).toEqual([{ record: dns_record, status: 'created' }])
		expect(redirect_status).toBe('created')
	})

	it('leaves the DNS record and redirect rules unchanged when they already match', async () => {
		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') {
				return new Response(JSON.stringify({ result: [{ id: 'rec-1', content: dns_record.content, proxied: dns_record.proxied }] }), { status: 200 })
			}
			if (url.includes('/rulesets/phases/http_request_firewall_custom/') && method === 'GET') return firewall_ruleset_response()
			if (url.includes('/rulesets/phases/') && method === 'GET') {
				return new Response(JSON.stringify({ result: { id: 'ruleset-1', rules: managed_rules_as_cloudflare_rules() } }), { status: 200 })
			}
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { dns_results, redirect_status } = await reconcile_dns({ credentials, fetch_impl })

		expect(dns_results).toEqual([{ record: dns_record, status: 'unchanged' }])
		expect(redirect_status).toBe('unchanged')
	})

	it('leaves redirect rules unchanged when the live API returns their parameters in a different key order', async () => {
		const live_rules = desired_redirect_rules.map(rule => ({
			description: `${managed_rule_prefix}${rule.ref}`,
			expression: rule.expression,
			action: 'redirect',
			action_parameters: {
				from_value: { preserve_query_string: rule.preserve_query_string, status_code: rule.status_code, target_url: { expression: rule.target_url_expression } },
			},
			enabled: true,
		}))

		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') {
				return new Response(JSON.stringify({ result: [{ id: 'rec-1', content: dns_record.content, proxied: dns_record.proxied }] }), { status: 200 })
			}
			if (url.includes('/rulesets/phases/http_request_firewall_custom/') && method === 'GET') return firewall_ruleset_response()
			if (url.includes('/rulesets/phases/') && method === 'GET') {
				return new Response(JSON.stringify({ result: { id: 'ruleset-1', rules: live_rules } }), { status: 200 })
			}
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { redirect_status } = await reconcile_dns({ credentials, fetch_impl })

		expect(redirect_status).toBe('unchanged')
	})

	it('marks a DNS record ambiguous and does not modify it when multiple records already match', async () => {
		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') {
				return new Response(
					JSON.stringify({ result: [{ id: 'a', content: 'one', proxied: true }, { id: 'b', content: 'two', proxied: true }] }),
					{ status: 200 },
				)
			}
			if (url.includes('/rulesets/phases/') && method === 'GET') return new Response(null, { status: 404 })
			if (url.endsWith('/rulesets') && method === 'POST') return new Response(JSON.stringify({ result: {} }), { status: 200 })
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { dns_results } = await reconcile_dns({ credentials, fetch_impl })

		expect(dns_results).toEqual([{ record: dns_record, status: 'ambiguous' }])
	})

	it('updates the redirect ruleset while preserving rules it does not manage', async () => {
		const unmanaged_rule = { description: 'some other rule', expression: '(true)', action: 'redirect', action_parameters: {}, enabled: true }
		let put_body: { rules: Array<{ description?: string }> } | undefined

		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') {
				return new Response(JSON.stringify({ result: [{ id: 'rec-1', content: dns_record.content, proxied: dns_record.proxied }] }), { status: 200 })
			}
			if (url.includes('/rulesets/phases/http_request_firewall_custom/') && method === 'GET') return firewall_ruleset_response()
			if (url.includes('/rulesets/phases/') && method === 'GET') {
				return new Response(JSON.stringify({ result: { id: 'ruleset-1', rules: [unmanaged_rule] } }), { status: 200 })
			}
			if (url.includes('/rulesets/ruleset-1') && method === 'PUT') {
				put_body = JSON.parse(init!.body as string)
				return new Response(JSON.stringify({ result: {} }), { status: 200 })
			}
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { redirect_status } = await reconcile_dns({ credentials, fetch_impl })

		expect(redirect_status).toBe('updated')
		expect(put_body?.rules).toHaveLength(1 + desired_redirect_rules.length)
		expect(put_body?.rules[0].description).toBe(unmanaged_rule.description)
	})

	it('creates the WAF custom ruleset with the block rules when the zone has none yet', async () => {
		let post_body: { phase: string; rules: Array<{ description?: string; action: string; expression: string }> } | undefined

		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') {
				return new Response(JSON.stringify({ result: [{ id: 'rec-1', content: dns_record.content, proxied: dns_record.proxied }] }), { status: 200 })
			}
			if (url.includes('/rulesets/phases/http_request_firewall_custom/') && method === 'GET') return new Response(null, { status: 404 })
			if (url.includes('/rulesets/phases/') && method === 'GET') {
				return new Response(JSON.stringify({ result: { id: 'ruleset-1', rules: managed_rules_as_cloudflare_rules() } }), { status: 200 })
			}
			if (url.endsWith('/rulesets') && method === 'POST') {
				post_body = JSON.parse(init!.body as string)
				return new Response(JSON.stringify({ result: {} }), { status: 200 })
			}
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { firewall_status } = await reconcile_dns({ credentials, fetch_impl })

		expect(firewall_status).toBe('created')
		expect(post_body?.phase).toBe('http_request_firewall_custom')
		expect(post_body?.rules).toEqual(desired_block_rules.map(rule => expect.objectContaining({ description: `${managed_rule_prefix}${rule.ref}`, action: 'block', expression: rule.expression })))
	})

	it('updates the WAF custom ruleset while preserving rules it does not manage', async () => {
		const unmanaged_rule = { description: 'hand-made rule', expression: '(ip.src eq 192.0.2.1)', action: 'block', enabled: true }
		let put_body: { rules: Array<{ description?: string }> } | undefined

		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') {
				return new Response(JSON.stringify({ result: [{ id: 'rec-1', content: dns_record.content, proxied: dns_record.proxied }] }), { status: 200 })
			}
			if (url.includes('/rulesets/phases/http_request_firewall_custom/') && method === 'GET') {
				return new Response(JSON.stringify({ result: { id: 'firewall-1', rules: [unmanaged_rule] } }), { status: 200 })
			}
			if (url.includes('/rulesets/phases/') && method === 'GET') {
				return new Response(JSON.stringify({ result: { id: 'ruleset-1', rules: managed_rules_as_cloudflare_rules() } }), { status: 200 })
			}
			if (url.includes('/rulesets/firewall-1') && method === 'PUT') {
				put_body = JSON.parse(init!.body as string)
				return new Response(JSON.stringify({ result: {} }), { status: 200 })
			}
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { firewall_status } = await reconcile_dns({ credentials, fetch_impl })

		expect(firewall_status).toBe('updated')
		expect(put_body?.rules.map(rule => rule.description)).toEqual([unmanaged_rule.description, ...desired_block_rules.map(rule => `${managed_rule_prefix}${rule.ref}`)])
	})

	it('treats a live entrypoint with no rules as an empty ruleset', async () => {
		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') {
				return new Response(JSON.stringify({ result: [{ id: 'rec-1', content: dns_record.content, proxied: dns_record.proxied }] }), { status: 200 })
			}
			if (url.includes('/rulesets/phases/http_request_firewall_custom/') && method === 'GET') return new Response(JSON.stringify({ result: { id: 'firewall-1' } }), { status: 200 })
			if (url.includes('/rulesets/phases/') && method === 'GET') {
				return new Response(JSON.stringify({ result: { id: 'ruleset-1', rules: managed_rules_as_cloudflare_rules() } }), { status: 200 })
			}
			if (url.includes('/rulesets/firewall-1') && method === 'PUT') return new Response(JSON.stringify({ result: {} }), { status: 200 })
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		const { firewall_status } = await reconcile_dns({ credentials, fetch_impl })

		expect(firewall_status).toBe('updated')
	})

	it('sends the Cloudflare bearer token on every request', async () => {
		const fetch_impl = router_fetch((url, init) => {
			const method = init?.method ?? 'GET'
			if (url.includes('/dns_records') && method === 'GET') return new Response(JSON.stringify({ result: [] }), { status: 200 })
			if (url.includes('/dns_records') && method === 'POST') return new Response(JSON.stringify({ result: {} }), { status: 200 })
			if (url.includes('/rulesets/phases/') && method === 'GET') return new Response(null, { status: 404 })
			if (url.endsWith('/rulesets') && method === 'POST') return new Response(JSON.stringify({ result: {} }), { status: 200 })
			throw new Error(`Unexpected request: ${method} ${url}`)
		})

		await reconcile_dns({ credentials, fetch_impl })

		const calls = (fetch_impl as unknown as ReturnType<typeof mock>).mock.calls
		for (const [, init] of calls) {
			expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${credentials.api_token}`)
		}
	})

	it('throws with the response body when a lookup fails unexpectedly', async () => {
		const fetch_impl = router_fetch(() => new Response('zone suspended', { status: 403 }))

		await expect(reconcile_dns({ credentials, fetch_impl })).rejects.toThrow(/403/)
	})
})
