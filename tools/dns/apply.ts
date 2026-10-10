import { desired_dns_records, desired_redirect_rules, managed_rule_prefix, type DesiredDnsRecord, type DesiredRedirectRule } from './config'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const REDIRECT_PHASE = 'http_request_dynamic_redirect'

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
	action: 'redirect'
	action_parameters: {
		from_value: {
			target_url: { expression: string }
			status_code: number
			preserve_query_string: boolean
		}
	}
	enabled: boolean
}

/** Idempotently reconciles every record in `desired_dns_records` and the redirect rules in
 * `desired_redirect_rules`. Safe to run repeatedly. Never touches a DNS record or redirect rule
 * this tool didn't create -- DNS records are matched by exact (type, name) before touching
 * anything, and existing redirect rules are only replaced if their `description` starts with
 * `managed_rule_prefix`; everything else in the zone is left alone. */
export async function reconcile_dns({ credentials, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	fetch_impl?: typeof fetch
}) {
	const dns_results = []
	for (const record of desired_dns_records) {
		dns_results.push({ record, status: await reconcile_dns_record({ credentials, record, fetch_impl }) })
	}

	const redirect_status = await reconcile_redirect_rules({ credentials, fetch_impl })

	return { dns_results, redirect_status }
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

async function reconcile_redirect_rules({ credentials, fetch_impl }: {
	credentials: CloudflareCredentials
	fetch_impl: typeof fetch
}): Promise<RulesetStatus> {
	const existing_ruleset = await get_redirect_ruleset({ credentials, fetch_impl })
	const desired_rules = desired_redirect_rules.map(to_cloudflare_rule)

	const unmanaged_rules = (existing_ruleset?.rules ?? []).filter(rule => !rule.description?.startsWith(managed_rule_prefix))
	const managed_existing = (existing_ruleset?.rules ?? []).filter(rule => rule.description?.startsWith(managed_rule_prefix))
	const merged_rules = [...unmanaged_rules, ...desired_rules]

	if (!existing_ruleset) {
		await create_redirect_ruleset({ credentials, rules: merged_rules, fetch_impl })
		return 'created'
	}

	const already_matches = managed_existing.length === desired_rules.length && managed_existing.every((existing_rule, index) => same_rule({ a: existing_rule, b: desired_rules[index] }))
	if (already_matches) return 'unchanged'

	await update_redirect_ruleset({ credentials, ruleset_id: existing_ruleset.id, rules: merged_rules, fetch_impl })
	return 'updated'
}

function to_cloudflare_rule(rule: DesiredRedirectRule): CloudflareRule {
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
		JSON.stringify(a.action_parameters) === JSON.stringify(b.action_parameters)
	)
}

async function get_redirect_ruleset({ credentials: { zone_id, api_token }, fetch_impl }: {
	credentials: CloudflareCredentials
	fetch_impl: typeof fetch
}): Promise<{ id: string; rules: CloudflareRule[] } | null> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/rulesets/phases/${REDIRECT_PHASE}/entrypoint`, {
		headers: auth_headers(api_token),
	})

	if (response.status === 404) return null
	if (!response.ok) throw new Error(`Failed to look up the "${REDIRECT_PHASE}" ruleset: ${response.status} ${await response.text()}`)

	const body = (await response.json()) as { result: { id: string; rules: CloudflareRule[] } }
	return body.result
}

async function create_redirect_ruleset({ credentials: { zone_id, api_token }, rules, fetch_impl }: {
	credentials: CloudflareCredentials
	rules: CloudflareRule[]
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/rulesets`, {
		method: 'POST',
		headers: auth_headers(api_token),
		body: JSON.stringify({ name: 'Redirect rules ruleset', kind: 'zone', phase: REDIRECT_PHASE, rules }),
	})

	if (!response.ok) throw new Error(`Failed to create the "${REDIRECT_PHASE}" ruleset: ${response.status} ${await response.text()}`)
}

async function update_redirect_ruleset({ credentials: { zone_id, api_token }, ruleset_id, rules, fetch_impl }: {
	credentials: CloudflareCredentials
	ruleset_id: string
	rules: CloudflareRule[]
	fetch_impl: typeof fetch
}): Promise<void> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/zones/${zone_id}/rulesets/${ruleset_id}`, {
		method: 'PUT',
		headers: auth_headers(api_token),
		body: JSON.stringify({ rules }),
	})

	if (!response.ok) throw new Error(`Failed to update the "${REDIRECT_PHASE}" ruleset: ${response.status} ${await response.text()}`)
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

	const { dns_results, redirect_status } = await reconcile_dns({ credentials: { zone_id, api_token } })

	for (const { record, status } of dns_results) {
		if (status === 'ambiguous') {
			console.warn(`⚠ ${record.type} ${record.name}: multiple existing records matched -- left untouched, resolve by hand.`)
		} else {
			console.log(`${record.type} ${record.name}: ${status}`)
		}
	}
	console.log(`Redirect rules: ${redirect_status}`)
}

function require_env(key: string): string {
	const value = process.env[key]
	if (!value) throw new Error(`Missing required env var "${key}". Set it in tools/dns/.env.local.`)
	return value
}
