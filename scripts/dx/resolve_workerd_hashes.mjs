// Deliberately plain JS with JSDoc types, not .ts (see ADR 0011): no TypeScript syntax, so it can
// run unmodified under a plain `node` binary on Windows without a build step or type-stripping flag.
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

// Miniflare's local D1 storage is a Durable Object (uniqueKey "miniflare-D1DatabaseObject" for every
// database) whose on-disk file name comes from workerd's native idFromName(database_id) derivation --
// an internal, undocumented algorithm with no JS-reachable implementation. Rather than guess it, boot
// the app's own installed wrangler via getPlatformProxy() (the same mechanism vite dev/adapter-cloudflare
// use) and write a uniquely-named marker table through each binding, then scan the state dir's existing
// .sqlite files to see which one picked it up. (A "which file is new" diff doesn't work here: the real
// file is almost always already sitting in the state dir from a previous `vite dev` run.)
//
/**
 * @param {{
 * 	app_dir: string
 * 	wrangler_path: string
 * 	entries: Array<{ binding?: string, database_name: string, database_id: string }>
 * 	d1_state_dir: string
 * }} options
 * @returns {Promise<Record<string, string>>}
 */
export async function resolve_workerd_hashes({ app_dir, wrangler_path, entries, d1_state_dir }) {
	const require_from_app = createRequire(join(app_dir, 'package.json'))
	const wrangler_entry = require_from_app.resolve('wrangler')
	const { getPlatformProxy } = await import(pathToFileURL(wrangler_entry).href)

	const proxy = await getPlatformProxy({
		configPath: wrangler_path,
		// getPlatformProxy()'s default persist path is relative to process.cwd(), not to configPath's
		// directory -- since this script always runs from the repo root, that default would silently
		// create/read a separate, wrong `.wrangler/state` at the repo root instead of the app's own.
		persist: { path: join(app_dir, '.wrangler', 'state', 'v3') },
	})
	/** @type {Record<string, string>} */
	const resolved = {}
	try {
		for (const d1 of entries) {
			if (!d1.binding) continue
			const marker = `_tabitha_resolve_${randomBytes(8).toString('hex')}`
			await proxy.env[d1.binding].exec(`CREATE TABLE "${marker}" (x INTEGER);`)

			const candidates = existsSync(d1_state_dir)
				? readdirSync(d1_state_dir).filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
				: []
			const match = candidates.find(f => {
				try {
					const found = execFileSync(
						'sqlite3',
						[join(d1_state_dir, f), `SELECT name FROM sqlite_master WHERE type='table' AND name='${marker}';`],
						{ encoding: 'utf-8' },
					).trim()
					return found === marker
				} catch {
					return false
				}
			})
			if (!match) {
				console.warn(`   ⚠️  Could not resolve Miniflare storage file for binding "${d1.binding}"`)
				continue
			}
			resolved[d1.database_id] = match.slice(0, -'.sqlite'.length)
		}
	} finally {
		await proxy.dispose()
	}
	return resolved
}

// CLI entry point, used only on Windows via a `node` subprocess (see db_load.ts). Reads
// { app_dir, wrangler_path, entries, d1_state_dir } as JSON on stdin, prints the resolved
// hash map as JSON on stdout.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const input = JSON.parse(await new Promise(resolve => {
		let data = ''
		process.stdin.on('data', chunk => { data += chunk })
		process.stdin.on('end', () => resolve(data))
	}))
	const resolved = await resolve_workerd_hashes({ app_dir: input.app_dir, wrangler_path: input.wrangler_path, entries: input.entries, d1_state_dir: input.d1_state_dir })
	process.stdout.write(JSON.stringify(resolved))
}
