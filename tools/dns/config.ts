/** Desired-state config for `tabitha.bible`'s DNS records and redirect rules, reconciled against
 * the live Cloudflare zone by `apply.ts`. This only covers the Cloudflare-hosted DNS zone -- the
 * domain's registrar (currently Porkbun, for the .bible TLD) is a separate, unaddressed concern;
 * this tool is named `dns` rather than `cloudflare-dns` so it isn't presumed to be Cloudflare-only
 * if registrar-level automation is ever added here too.
 */

/** Every redirect rule this tool manages carries a `description` starting with this prefix, so
 * `apply.ts` can find and replace only its own rules on re-apply without touching any other rule
 * that might already exist in the same ruleset phase (manually created, or added by something
 * else later). */
export const managed_rule_prefix = 'tabitha/tools/dns:'

export type DesiredDnsRecord = {
	type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX'
	/** Full hostname, e.g. `'www.tabitha.bible'`. */
	name: string
	content: string
	/** Whether traffic is proxied through Cloudflare (orange-clouded). Required for a `CNAME`
	 * that's meant to be intercepted by a Redirect Rule, since DNS-only traffic never reaches
	 * Cloudflare's rules engine. */
	proxied: boolean
}

export type DesiredRedirectRule = {
	/** Suffixed onto `managed_rule_prefix` to form the rule's full `description`, which doubles as
	 * its stable identity across re-applies. Keep this short and unique among the rules below. */
	ref: string
	/** Cloudflare rules-language match expression, e.g. `(http.host eq "www.tabitha.bible")`. */
	expression: string
	/** Rules-language expression producing the destination URL, e.g.
	 * `concat("https://tabitha.bible", http.request.uri.path)`. Always a dynamic expression here
	 * (never a static `target_url.value`) so the request path carries through. */
	target_url_expression: string
	status_code: 301 | 302
	preserve_query_string: boolean
}

export const desired_dns_records: DesiredDnsRecord[] = [
	// tabitha.bible is the canonical root (see the www backlog item for why); this CNAME exists
	// solely so Cloudflare has a hostname to intercept before the redirect rule below fires --
	// without it, www.tabitha.bible has no DNS record at all and fails with NXDOMAIN.
	{ type: 'CNAME', name: 'www.tabitha.bible', content: 'tabitha.bible', proxied: true },
]

export const desired_redirect_rules: DesiredRedirectRule[] = [
	{
		ref: 'www-to-apex',
		expression: '(http.host eq "www.tabitha.bible")',
		target_url_expression: 'concat("https://tabitha.bible", http.request.uri.path)',
		status_code: 301,
		preserve_query_string: true,
	},
	// Zone-wide, so every app subdomain redirects too. Listed after www-to-apex so a plain-HTTP
	// www request reaches the apex in one hop. Without this, http://tabitha.bible/ answers 200 and
	// Search Console reports it as an alternate of the https page.
	{
		ref: 'http-to-https',
		expression: '(not ssl)',
		target_url_expression: 'concat("https://", http.host, http.request.uri.path)',
		status_code: 301,
		preserve_query_string: true,
	},
]
