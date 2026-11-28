import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'bun:sqlite'
import { LOCAL_D1_STATE_DIR } from '@tabitha/vite-config/local-state'
import {
	apps_config,
	parse_wrangler_jsonc,
	read_workerd_hash_cache,
	resolve_workerd_hashes,
	write_workerd_hash_cache,
} from './db_load'

// The apps that sign in against DB_Auth (ADR 0027). Each name is a `Permissions.app` value and an
// app whose wrangler.jsonc binds DB_Auth. Locally, as in production, every app shares one DB_Auth.
export const AUTH_APPS = ['ontology', 'sources'] as const
export type AuthApp = typeof AUTH_APPS[number]

export function parse_auth_app({ args }: { args: string[] }): AuthApp {
	const app = args.find(arg => arg.startsWith('--app='))?.slice('--app='.length)
	if (!app) {
		throw new Error(`--app is required, since DB_Auth holds grants for every app: --app=${AUTH_APPS.join('|')}`)
	}
	if (!AUTH_APPS.includes(app as AuthApp)) {
		throw new Error(`"${app}" doesn't sign in against DB_Auth. Known: ${AUTH_APPS.join(', ')}`)
	}
	return app as AuthApp
}

// The D1 migrations never seed real user grants (those only ever exist in production) -- so every
// fresh local `db:load` starts with nobody holding any permission. This grants your own account
// access locally, in the same Auth D1 file `db:load`/`vite dev` actually reads from -- resolved the
// same reliable way db_load.ts does, rather than guessing a file name.
async function grant_permission({ apps, email: raw_email, permissions }: {
	apps: readonly AuthApp[]
	email: string
	permissions?: string[]
}) {
	const email = raw_email.toLowerCase()
	// Any app that binds DB_Auth resolves the same shared local file
	const config = apps_config[apps[0]]
	const wrangler = parse_wrangler_jsonc(config.wrangler_path)
	const auth_db = wrangler?.d1_databases?.find(d1 => d1.binding === 'DB_Auth')
	if (!auth_db) {
		console.error(`❌ Could not find a DB_Auth binding in apps/${apps[0]}/wrangler.jsonc`)
		process.exit(1)
	}

	const d1_state_dir = LOCAL_D1_STATE_DIR
	mkdirSync(d1_state_dir, { recursive: true })

	const workerd_hash_cache = read_workerd_hash_cache()
	let hash = workerd_hash_cache[auth_db.database_id]
	if (!hash || !existsSync(join(d1_state_dir, `${hash}.sqlite`))) {
		console.log('🔍 Resolving the local Auth database file...')
		Object.assign(workerd_hash_cache, await resolve_workerd_hashes({ config, entries: [auth_db] }))
		write_workerd_hash_cache(workerd_hash_cache)
		hash = workerd_hash_cache[auth_db.database_id]
	}

	if (!hash) {
		console.error('❌ Could not resolve the local Auth database file. Run `bun run db:load` first.')
		process.exit(1)
	}

	const db = new Database(join(d1_state_dir, `${hash}.sqlite`))
	// A running dev server may be writing the same file; wait for its lock rather than fail
	db.exec('PRAGMA busy_timeout = 5000')

	const placeholders = apps.map(() => '?').join(', ')
	const app_permissions = db.prepare(`SELECT id, app, permission FROM Permissions WHERE app IN (${placeholders})`)
		.all(...apps) as { id: number, app: string, permission: string }[]

	if (app_permissions.length === 0) {
		console.error(`❌ No permissions found for ${apps.join(', ')} in the local Auth DB. Run \`bun run db:load\` first.`)
		process.exit(1)
	}

	const to_grant = permissions?.length
		? app_permissions.filter(p => permissions.includes(p.permission))
		: app_permissions

	const unknown = permissions?.filter(p => !app_permissions.some(a => a.permission === p)) ?? []
	for (const permission of unknown) {
		console.warn(`⚠️  Unknown permission "${permission}" for ${apps.join(', ')}, skipping. Known: ${[...new Set(app_permissions.map(p => p.permission))].join(', ')}`)
	}

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

	db.close(true)
	console.log(`✅ ${email} now has: ${to_grant.map(p => `${p.app}:${p.permission}`).join(', ')} (${granted} newly granted).`)
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	const [email, ...permissions] = args.filter(arg => !arg.startsWith('--'))
	if (!email) {
		console.error(`Usage: bun scripts/dx/grant_permission.ts [--app=${AUTH_APPS.join('|')}] <email> [permission...]`)
		console.error('       Without --app, grants for every app. With no permissions listed, grants every one the app has.')
		process.exit(1)
	}
	const apps = args.some(arg => arg.startsWith('--app=')) ? [parse_auth_app({ args })] : AUTH_APPS
	await grant_permission({ apps, email, permissions: permissions.length ? permissions : undefined })
}
