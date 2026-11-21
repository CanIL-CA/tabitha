// Prunes the db-generation bucket. Keeps what a rollback needs, deletes what no pin can name.
//
//   bun run data:prune                 prints the plan (nothing is deleted)
//   bun run data:prune -- --run        deletes it
//   bun run data:prune -- --ref HEAD   reads the pins from this checkout's history, not origin/main
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (the ones in tools/r2/.env.local work) and
// wrangler. Reads the pins from git history, so a shallow checkout won't do.
import { LANGUAGE } from './engine_source'

const BUCKET = 'db-generation'
const ENGINE_SOURCE_FILE = 'apps/generator/scripts/engine_source.ts'
// The current pin and the one before it: what reverting a pin can land on
const PINS_TO_KEEP = 2
const HISTORY_DEPTH = 50

export type Pin = { version: string, date: string }

export type PrunePlan = {
	keep: string[]
	remove: string[]
	unrecognized: string[]
}

function compare_versions({ a, b }: { a: string, b: string }) {
	const left = a.split('.').map(Number)
	const right = b.split('.').map(Number)
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0)
		if (difference !== 0) return difference
	}
	return 0
}

// Orders by Ontology version, then by the export's date.
function compare_pins({ a, b }: { a: Pin, b: Pin }) {
	return compare_versions({ a: a.version, b: b.version }) || a.date.localeCompare(b.date)
}

/** Reads the pin out of engine_source.ts's text, or undefined when it has no dated pin (older versions of the file). */
export function parse_pin({ source }: { source: string }): Pin | undefined {
	const version = source.match(/ONTOLOGY_VERSION = '([0-9.]+)'/)?.[1]
	const date = source.match(/EXPORT_DATE = '(\d{4}-\d{2}-\d{2})'/)?.[1]
	return version && date ? { version, date } : undefined
}

/** The distinct pins of the commits on the ref that changed engine_source.ts, newest first. */
export function pins_in_history({ versions }: { versions: string[] }): Pin[] {
	const pins: Pin[] = []
	for (const source of versions) {
		const pin = parse_pin({ source })
		if (pin && !pins.some(known => compare_pins({ a: known, b: pin }) === 0)) pins.push(pin)
	}
	return pins
}

/** Sorts every key in the bucket into keep, remove or unrecognized (reported, never removed). */
export function plan_prune({ keys, pins, language }: { keys: string[], pins: Pin[], language: string }): PrunePlan {
	const [current] = pins
	if (!current) throw new Error('No pin to keep: engine_source.ts has no dated pin on that ref.')
	const kept_pins = pins.slice(0, PINS_TO_KEEP)
	const plan: PrunePlan = { keep: [], remove: [], unrecognized: [] }

	for (const key of keys) {
		const [version, file] = key.split('/')
		const dated_language = file?.match(new RegExp(`^${language}_(\\d{4}-\\d{2}-\\d{2})\\.sqlite$`))
		if (key === 'manifest.json') plan.keep.push(key)
		else if (file === 'Ontology.sqlite') {
			const wanted = kept_pins.some(pin => pin.version === version) || compare_versions({ a: version, b: current.version }) > 0
			;(wanted ? plan.keep : plan.remove).push(key)
		} else if (dated_language) {
			const pin = { version, date: dated_language[1] }
			const wanted = kept_pins.some(kept => compare_pins({ a: kept, b: pin }) === 0) || compare_pins({ a: pin, b: current }) > 0
			;(wanted ? plan.keep : plan.remove).push(key)
		} else plan.unrecognized.push(key)
	}
	return plan
}

async function run({ args }: { args: string[] }) {
	const apply = args.includes('--run')
	const ref_index = args.indexOf('--ref')
	const ref = ref_index === -1 ? 'origin/main' : args[ref_index + 1]
	const { CLOUDFLARE_ACCOUNT_ID: account_id, CLOUDFLARE_API_TOKEN: api_token } = process.env
	if (!account_id || !api_token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (see tools/r2/.env.local).')

	if (ref === 'origin/main') await Bun.$`git fetch --quiet origin main`
	const commits = (await Bun.$`git log --format=%H -n ${HISTORY_DEPTH} ${ref} -- ${`:/${ENGINE_SOURCE_FILE}`}`.text()).split('\n').filter(Boolean)
	const versions = await Promise.all(commits.map(commit => Bun.$`git show ${commit}:${ENGINE_SOURCE_FILE}`.text()))
	const pins = pins_in_history({ versions })
	if (pins.length === 0) throw new Error(`${ref} has no dated pin yet. Merge the PR that adds EXPORT_DATE first, or read this checkout's history with --ref HEAD.`)

	const keys = await list_keys({ account_id, api_token })
	const plan = plan_prune({ keys, pins, language: LANGUAGE })

	console.info(`Pins kept (from ${ref}): ${pins.slice(0, PINS_TO_KEEP).map(pin => `${pin.version} ${pin.date}`).join(', ')}`)
	for (const [label, group] of [['Keep', plan.keep], ['Remove', plan.remove], ['Unrecognized (left alone)', plan.unrecognized]] as const) {
		console.info(`\n${label}: ${group.length}`)
		for (const key of group) console.info(`  ${key}`)
	}
	if (!apply) return console.info(plan.remove.length > 0 ? '\nDry run. Run with --run to delete the files under "Remove".' : '\nNothing to remove.')

	for (const key of plan.remove) await Bun.$`bunx wrangler r2 object delete ${`${BUCKET}/${key}`} --remote`
	console.info(`\nRemoved ${plan.remove.length} file(s).`)
}

async function list_keys({ account_id, api_token }: { account_id: string, api_token: string }) {
	const keys: string[] = []
	let cursor: string | undefined
	do {
		const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${account_id}/r2/buckets/${BUCKET}/objects`)
		if (cursor) url.searchParams.set('cursor', cursor)
		const response = await fetch(url, { headers: { Authorization: `Bearer ${api_token}` } })
		const body = await response.json() as { success: boolean, result: { key: string }[], result_info?: { cursor?: string, is_truncated?: boolean } }
		if (!body.success) throw new Error(`Listing ${BUCKET} failed: ${JSON.stringify(body)}`)
		keys.push(...body.result.map(object => object.key))
		cursor = body.result_info?.is_truncated ? body.result_info.cursor : undefined
	} while (cursor)
	return keys.sort()
}

if (import.meta.main) await run({ args: process.argv.slice(2) })
