import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'bun:sqlite'
import {
	apps_config,
	parse_wrangler_jsonc,
	read_workerd_hash_cache,
	resolve_workerd_hashes,
	write_workerd_hash_cache,
} from './db_load'

// Only apps/ontology has a Users/Permissions model today. The snapshot pipeline never seeds real
// user grants (those only ever exist in production) -- so every fresh local `db:load:ontology` starts
// with nobody able to pass an is_authorized() check. This grants your own account access locally, in
// the same Auth D1 file `db:load`/`vite dev` actually reads from -- resolved the same reliable way
// db_load.ts does, rather than guessing a file name.
async function grant_permission(email: string, permissions?: string[]) {
	const config = apps_config.ontology
	const wrangler = parse_wrangler_jsonc(config.wrangler_path)
	const auth_db = wrangler?.d1_databases?.find(d1 => d1.binding === 'DB_Auth')
	if (!auth_db) {
		console.error('❌ Could not find a DB_Auth binding in apps/ontology/wrangler.jsonc')
		process.exit(1)
	}

	const d1_state_dir = join(config.app_dir, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')
	mkdirSync(d1_state_dir, { recursive: true })

	const workerd_hash_cache = read_workerd_hash_cache()
	let hash = workerd_hash_cache[auth_db.database_id]
	if (!hash || !existsSync(join(d1_state_dir, `${hash}.sqlite`))) {
		console.log('🔍 Resolving the local Auth database file...')
		Object.assign(workerd_hash_cache, await resolve_workerd_hashes(config, [auth_db], d1_state_dir))
		write_workerd_hash_cache(workerd_hash_cache)
		hash = workerd_hash_cache[auth_db.database_id]
	}

	if (!hash) {
		console.error('❌ Could not resolve the local Auth database file. Run `bun run db:load:ontology` first.')
		process.exit(1)
	}

	const db = new Database(join(d1_state_dir, `${hash}.sqlite`))

	const app_permissions = db.prepare('SELECT id, permission FROM Permissions WHERE app = ?')
		.all('ontology') as { id: number, permission: string }[]

	if (app_permissions.length === 0) {
		console.error('❌ No permissions found for "ontology" in the local Auth DB. Run `bun run db:load:ontology` first.')
		process.exit(1)
	}

	const to_grant = permissions?.length
		? app_permissions.filter(p => permissions.includes(p.permission))
		: app_permissions

	const unknown = permissions?.filter(p => !app_permissions.some(a => a.permission === p)) ?? []
	for (const permission of unknown) {
		console.warn(`⚠️  Unknown permission "${permission}" for app "ontology", skipping. Known: ${app_permissions.map(p => p.permission).join(', ')}`)
	}

	// 'email' is no longer a primary key, and so a REPLACE doesn't trigger anymore
	const user_id = db.prepare<{ id: number }, [string]>('SELECT id FROM Users WHERE email = ?').get(email)?.id
		?? db.prepare('INSERT INTO Users (email, name) VALUES (?, ?)').run(email, email).lastInsertRowid

	let granted = 0
	for (const { id } of to_grant) {
		const existing = db.prepare('SELECT 1 FROM User_Permissions WHERE user_id = ? AND permission_id = ?').get(user_id, id)
		if (!existing) {
			db.prepare('INSERT INTO User_Permissions (user_id, permission_id) VALUES (?, ?)').run(user_id, id)
			granted++
		}
	}

	db.close()
	console.log(`✅ ${email} now has: ${to_grant.map(p => p.permission).join(', ')} (${granted} newly granted).`)
}

if (import.meta.main) {
	const [email, ...permissions] = process.argv.slice(2)
	if (!email) {
		console.error('Usage: bun scripts/dx/grant_permission.ts <email> [permission...]')
		console.error('       With no permissions listed, grants every "ontology" permission.')
		process.exit(1)
	}
	await grant_permission(email, permissions.length ? permissions : undefined)
}
