import { desired_block_rules, desired_dns_records, desired_redirect_rules, managed_rule_prefix, type DesiredBlockRule, type DesiredDnsRecord, type DesiredRedirectRule } from './config'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

/** Each ruleset phase this tool manages rules in, with the name it gives the phase's entrypoint
 * ruleset if it has to create one. */
const PHASES = {
	redirect: { phase: 'http_request_dynamic_redirect', ruleset_name: 'Redirect rules ruleset' },
	firewall: { phase: 'http_request_firewall_custom', ruleset_name: 'Custom rules ruleset' },
}

type Phase = typeof PHASES[keyof typeof PHASES]

export type CloudflareCredentials = {
	zone_id: string
	api_token: string
}

type DnsRecordStatus = 'created' | 'updated' | 'unchanged' | 'ambiguous'
type RulesetStatus = 'created' | 'updated' | 'unchanged'

/** Cloudflare's ruleset rule shape, trimmed to the fields this tool reads or writes. The live API
 * echoes back several more (id, version, ref, categories, logging, last_updated) that are ignored
 * here rather than modeled -- see `strip_to_managed_fields` below. */
type CloudflareRule = {
	description?: string
	expression: string
	action: 'redirect' | 'block'
	action_parameters?: {
		from_value: {
			target_url: { expression: string }
			status_code: number
			preserve_query_string: boolean
		}
	}
	enabled: boolean
}

/** Idempotently reconciles every record in `desired_dns_records`, the redirect rules in
 * `desired_redirect_rules`, and the WAF custom rules in `desired_block_rules`. Safe to run
 * repeatedly. Never touches a DNS record or rule this tool didn't create -- DNS records are matched
 * by exact (type, name) before touching anything, and existing rules are only replaced if their
 * `description` starts with `managed_rule_prefix`; everything else in the zone is left alone. */
export async function reconcile_dns({ credentials, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	fetch_impl?: typeof fetch
}) {
	const dns_results = []
	for (const record of desired_dns_records) {
		dns_results.push({ record, status: await reconcile_dns_record({ credentials, record, fetch_impl }) })
	}

	const redirect_status = await reconcile_ruleset({ credentials, phase: PHASES.redirect, desired_rules: desired_redirect_rules.map(to_redirect_rule), fetch_impl })
	const firewall_status = await reconcile_ruleset({ credentials, phase: PHASES.firewall, desired_rules: desired_block_rules.map(to_block_rule), fetch_impl })

	return { dns_results, redirect_status, firewall_status }
}

async function reconcile_dns_record({ credentials, record, fetch_impl }: {
	credentials: CloudflareCredentials
	record: DesiredDnsRecord
	fetch_impl: typeof fetch
}): Promise<DnsRecordStatus> {
	const existing = await find_dns_records({ credentials, record, fetch_impl })

	// Multiple records can legitimately share a (type, name) -- e.g. round-robin A records. Rather
	// than guess which one to touch, this tool only ever manages a record it can uniquely identify.
	if (existing.length > 1) return 'ambiguous'

	if (existing.length === 0) {
		await create_dns_record({ credentials, record, fetch_impl })
		return 'created'
	}

	const [current] = existing
	if (current.content === record.content && current.proxied === record.proxied) return 'unchanged'

	await update_dns_record({ credentials, record_id: current.id, record, fetch_impl })
	return 'updated'
}

async function find_dns_records({ credentials: { zone_id, api_token }, record, fetch_impl }: {
	credentials: CloudflareCredentials
	record: DesiredDnsRecord
	fetch_impl: typeof fetch
}): Promise<Array<{ id: string; content: string; proxied: boolean }>> {
	const url = `${CLOUDFLARE_API_BASE}/zones/${zone_id}/dns_records?type=${record.type}&name=${encodeURIComponent(record.name)}`
	const response = await fetch_impl(url, { headers: auth_headers(api_token) })

	if (!response.ok) throw new Error(`Failed to look up DNS record "${record.name}" (${record.type}): ${response.status} ${await response.text()}`)

	const body = (await response.json()) as { result: Array<{ id: string; content: string; proxied: boolean }> }
	return body.result
}

async function create_dns_record({ credentials: { zone_id, api_token }, record, fetch_impl }: {
	credentials: CloudflareCredentials
	record: DesiredDnsRecord
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/dns_records`, {
		method: 'POST',
		headers: auth_headers(api_token),
		body: JSON.stringify(record),
	})

	if (!response.ok) throw new Error(`Failed to create DNS record "${record.name}" (${record.type}): ${response.status} ${await response.text()}`)
}

async function update_dns_record({ credentials: { zone_id, api_token }, record_id, record, fetch_impl }: {
	credentials: CloudflareCredentials
	record_id: string
	record: DesiredDnsRecord
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/dns_records/${record_id}`, {
		method: 'PUT',
		headers: auth_headers(api_token),
		body: JSON.stringify(record),
	})

	if (!response.ok) throw new Error(`Failed to update DNS record "${record.name}" (${record.type}): ${response.status} ${await response.text()}`)
}

async function reconcile_ruleset({ credentials, phase, desired_rules, fetch_impl }: {
	credentials: CloudflareCredentials
	phase: Phase
	desired_rules: CloudflareRule[]
	fetch_impl: typeof fetch
}): Promise<RulesetStatus> {
	const existing_ruleset = await get_ruleset({ credentials, phase, fetch_impl })

	const unmanaged_rules = (existing_ruleset?.rules ?? []).filter(rule => !rule.description?.startsWith(managed_rule_prefix))
	const managed_existing = (existing_ruleset?.rules ?? []).filter(rule => rule.description?.startsWith(managed_rule_prefix))
	const merged_rules = [...unmanaged_rules, ...desired_rules]

	if (!existing_ruleset) {
		await create_ruleset({ credentials, phase, rules: merged_rules, fetch_impl })
		return 'created'
	}

	const already_matches = managed_existing.length === desired_rules.length && managed_existing.every((existing_rule, index) => same_rule({ a: existing_rule, b: desired_rules[index] }))
	if (already_matches) return 'unchanged'

	await update_ruleset({ credentials, phase, ruleset_id: existing_ruleset.id, rules: merged_rules, fetch_impl })
	return 'updated'
}

function to_block_rule(rule: DesiredBlockRule): CloudflareRule {
	return {
		description: `${managed_rule_prefix}${rule.ref}`,
		expression: rule.expression,
		action: 'block',
		enabled: true,
	}
}

function to_redirect_rule(rule: DesiredRedirectRule): CloudflareRule {
	return {
		description: `${managed_rule_prefix}${rule.ref}`,
		expression: rule.expression,
		action: 'redirect',
		action_parameters: {
			from_value: {
				target_url: { expression: rule.target_url_expression },
				status_code: rule.status_code,
				preserve_query_string: rule.preserve_query_string,
			},
		},
		enabled: true,
	}
}

/** Compares only the fields this tool authors, ignoring everything the live API echoes back
 * alongside them (id, version, ref, categories, logging, last_updated, ...). */
function same_rule({ a, b }: {
	a: CloudflareRule
	b: CloudflareRule
}): boolean {
	return (
		a.description === b.description &&
		a.expression === b.expression &&
		a.action === b.action &&
		a.enabled === b.enabled &&
		// The live API returns these keys in its own order, so compare structurally, not as JSON text.
		Bun.deepEquals(a.action_parameters, b.action_parameters)
	)
}

async function get_ruleset({ credentials: { zone_id, api_token }, phase: { phase }, fetch_impl }: {
	credentials: CloudflareCredentials
	phase: Phase
	fetch_impl: typeof fetch
}): Promise<{ id: string; rules: CloudflareRule[] } | null> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/rulesets/phases/${phase}/entrypoint`, {
		headers: auth_headers(api_token),
	})

	if (response.status === 404) return null
	if (!response.ok) throw new Error(`Failed to look up the "${phase}" ruleset: ${response.status} ${await response.text()}`)

	const body = (await response.json()) as { result: { id: string; rules?: CloudflareRule[] } }
	return { id: body.result.id, rules: body.result.rules ?? [] }
}

async function create_ruleset({ credentials: { zone_id, api_token }, phase: { phase, ruleset_name }, rules, fetch_impl }: {
	credentials: CloudflareCredentials
	phase: Phase
	rules: CloudflareRule[]
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/rulesets`, {
		method: 'POST',
		headers: auth_headers(api_token),
		body: JSON.stringify({ name: ruleset_name, kind: 'zone', phase, rules }),
	})

	if (!response.ok) throw new Error(`Failed to create the "${phase}" ruleset: ${response.status} ${await response.text()}`)
}

async function update_ruleset({ credentials: { zone_id, api_token }, phase: { phase }, ruleset_id, rules, fetch_impl }: {
	credentials: CloudflareCredentials
	phase: Phase
	ruleset_id: string
	rules: CloudflareRule[]
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/rulesets/${ruleset_id}`, {
		method: 'PUT',
		headers: auth_headers(api_token),
		body: JSON.stringify({ rules }),
	})

	if (!response.ok) throw new Error(`Failed to update the "${phase}" ruleset: ${response.status} ${await response.text()}`)
}

function auth_headers(api_token: string): HeadersInit {
	return {
		'Authorization': `Bearer ${api_token}`,
		'Content-Type': 'application/json',
	}
}

if (import.meta.main) {
	const zone_id = require_env('CLOUDFLARE_ZONE_ID')
	const api_token = require_env('CLOUDFLARE_API_TOKEN')

	const { dns_results, redirect_status, firewall_status } = await reconcile_dns({ credentials: { zone_id, api_token } })

	for (const { record, status } of dns_results) {
		if (status === 'ambiguous') {
			console.warn(`⚠ ${record.type} ${record.name}: multiple existing records matched -- left untouched, resolve by hand.`)
		} else {
			console.log(`${record.type} ${record.name}: ${status}`)
		}
	}
	console.log(`Redirect rules: ${redirect_status}`)
	console.log(`WAF custom rules: ${firewall_status}`)
}

function require_env(key: string): string {
	const value = process.env[key]
	if (!value) throw new Error(`Missing required env var "${key}". Set it in tools/dns/.env.local.`)
	return value
}
