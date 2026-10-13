import { join } from 'node:path'
import { $ } from 'bun'
import { desired_buckets, type BucketAccess, type DesiredBucket } from './config'

/** Cloudflare's R2 CLI/API has no per-resource token scoping (same limitation as `tools/workers`
 * -- see that package's README), and `wrangler r2 bucket list`/`dev-url get`/`domain list` have no
 * `--json` output (unlike `wrangler r2 bucket info`), so this tool shells out to `wrangler`
 * directly and parses its plain-text output, the same way `tools/databases/migrations/r2_sync.ts`
 * already does for R2 object operations -- rather than the raw-REST-API approach `tools/gateway`
 * and `tools/dns` use for resources whose API does return clean JSON. */

/** Bun's `$` doesn't reliably resolve a bare `wrangler` against this package's own
 * `node_modules/.bin` -- the same issue `scripts/dx/r2_load.ts` already worked around by invoking
 * wrangler's JS entrypoint directly via `bun`, instead of relying on the `node_modules/.bin` shim. */
const WRANGLER = join(import.meta.dir, 'node_modules/wrangler/bin/wrangler.js')

export type AccessChange = { from: string; to: string }

export type BucketPlan = {
	name: string
	bucket_created: boolean
	access_change: AccessChange | null
}

// eslint-disable-next-line no-control-regex -- the control character is the ANSI escape byte being stripped, not a mistake.
const ANSI = /\x1b\[[0-9;]*m/g
const strip_ansi = (text: string) => text.replace(ANSI, '')

async function bucket_exists(name: string): Promise<boolean> {
	const result = await $`bun ${WRANGLER} r2 bucket info ${name} --json`.nothrow().quiet()
	return result.exitCode === 0
}

async function get_r2_dev_enabled(name: string): Promise<boolean> {
	const result = await $`bun ${WRANGLER} r2 bucket dev-url get ${name}`.quiet()
	return strip_ansi(result.stdout.toString()).includes('is enabled')
}

async function get_custom_domains(name: string): Promise<string[]> {
	const result = await $`bun ${WRANGLER} r2 bucket domain list ${name}`.quiet()
	const text = strip_ansi(result.stdout.toString())
	return [...text.matchAll(/^domain:\s+(\S+)$/gm)].map(match => match[1])
}

function describe_access(access: BucketAccess): string {
	if (access.type === 'none') return 'private'
	if (access.type === 'r2_dev') return 'r2.dev enabled'
	return `custom domain ${access.domain}`
}

/** Idempotently reconciles every bucket in `desired_buckets` (or `buckets`, for tests). Creates a
 * bucket if it doesn't exist yet, and enables/connects the access method declared in `config.ts`
 * if it isn't already in place. Never disables an existing r2.dev toggle or removes an existing
 * custom domain that isn't declared -- like `tools/dns`/`tools/workers`, this tool only ever adds
 * what it's told to, never tears down access another bucket already depends on based on a guess.
 * When `apply` is false, computes the same plan without writing anything. */
export async function reconcile_r2({ apply, buckets = desired_buckets }: {
	apply: boolean
	buckets?: DesiredBucket[]
}): Promise<BucketPlan[]> {
	const plans: BucketPlan[] = []

	for (const bucket of buckets) {
		const exists = await bucket_exists(bucket.name)
		if (!exists && apply) await $`bun ${WRANGLER} r2 bucket create ${bucket.name}`.quiet()

		const access_change = await reconcile_access({ bucket, bucket_exists_already: exists, apply })

		plans.push({ name: bucket.name, bucket_created: !exists, access_change })
	}

	return plans
}

async function reconcile_access({ bucket, bucket_exists_already, apply }: {
	bucket: DesiredBucket
	bucket_exists_already: boolean
	apply: boolean
}): Promise<AccessChange | null> {
	const { access } = bucket

	if (access.type === 'r2_dev') {
		const currently_enabled = bucket_exists_already && await get_r2_dev_enabled(bucket.name)
		if (currently_enabled) return null
		if (apply) await $`bun ${WRANGLER} r2 bucket dev-url enable ${bucket.name} --force`.quiet()
		return { from: 'private', to: describe_access(access) }
	}

	if (access.type === 'custom_domain') {
		const existing_domains = bucket_exists_already ? await get_custom_domains(bucket.name) : []
		if (existing_domains.includes(access.domain)) return null
		if (apply) await $`bun ${WRANGLER} r2 bucket domain add ${bucket.name} --domain ${access.domain} --zone-id ${access.zone_id} --force`.quiet()
		return { from: existing_domains.length > 0 ? existing_domains.join(', ') : 'private', to: describe_access(access) }
	}

	// access.type === 'none': nothing to grant. Existing access this tool didn't grant is left
	// alone (see reconcile_r2's doc comment) rather than guessed at here.
	return null
}

if (import.meta.main) {
	require_env('CLOUDFLARE_API_TOKEN')
	require_env('CLOUDFLARE_ACCOUNT_ID')
	const apply = process.argv.includes('--run')

	const plans = await reconcile_r2({ apply })

	let any_changes = false
	for (const plan of plans) {
		const changes: string[] = []
		if (plan.bucket_created) changes.push(apply ? 'created bucket' : 'would create bucket')
		if (plan.access_change) changes.push(`${apply ? '' : 'would '}grant access: ${plan.access_change.from} -> ${plan.access_change.to}`)

		if (changes.length === 0) console.log(`${plan.name}: unchanged`)
		else {
			any_changes = true
			console.log(`${plan.name}: ${changes.join('; ')}`)
		}
	}

	if (!apply && any_changes) console.log('\nRun `bun run apply:run` to apply these changes.')
}

function require_env(key: string): string {
	const value = process.env[key]
	if (!value) throw new Error(`Missing required env var "${key}". Set it in tools/r2/.env.local.`)
	return value
}
