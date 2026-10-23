import { join } from 'node:path'
import { apps_config } from './db_load'

// Production counterpart of grant_permission.ts: grants Ontology permissions in the remote DB_Auth
// D1 database. Each email is its own Users row (lookup is by email), so one person with two
// addresses is simply listed twice. Idempotent: re-running adds only what is missing.
// Prints the SQL and stops unless --apply is passed.

type UserGrant = {
	email: string
	name: string
}

const DEFAULT_PERMISSIONS = ['PROTECTED_ACCESS']
const EMAIL_PATTERN = /^[^\s@']+@[^\s@']+\.[^\s@']+$/
const PERMISSION_PATTERN = /^[A-Z_]+$/

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

export function parse_user({ arg }: { arg: string }): UserGrant {
	const [raw_email, name] = arg.split('=')
	if (!EMAIL_PATTERN.test(raw_email)) {
		throw new Error(`"${raw_email}" is not a valid email address`)
	}
	const email = raw_email.toLowerCase()
	return { email, name: name?.trim() || email }
}

export function build_grant_sql({ users, permissions }: { users: UserGrant[], permissions: string[] }): string {
	const bad_permission = permissions.find(permission => !PERMISSION_PATTERN.test(permission))
	if (bad_permission) {
		throw new Error(`"${bad_permission}" is not a valid permission name`)
	}
	const permission_list = permissions.map(quote).join(', ')
	return users.flatMap(({ email, name }) => [
		`INSERT INTO Users (email, name) SELECT ${quote(email)}, ${quote(name)} WHERE NOT EXISTS (SELECT 1 FROM Users WHERE email = ${quote(email)} COLLATE NOCASE);`,
		`INSERT INTO User_Permissions (user_id, permission_id) SELECT u.id, p.id FROM Users u, Permissions p WHERE u.email = ${quote(email)} COLLATE NOCASE AND p.app = 'ontology' AND p.permission IN (${permission_list}) AND NOT EXISTS (SELECT 1 FROM User_Permissions x WHERE x.user_id = u.id AND x.permission_id = p.id);`,
	]).join('\n')
}

export function build_verify_sql({ users }: { users: UserGrant[] }): string {
	const email_list = users.map(({ email }) => quote(email)).join(', ')
	return `SELECT u.email, u.name, group_concat(p.permission) AS permissions FROM Users u LEFT JOIN User_Permissions up ON up.user_id = u.id LEFT JOIN Permissions p ON p.id = up.permission_id AND p.app = 'ontology' WHERE u.email COLLATE NOCASE IN (${email_list}) GROUP BY u.id ORDER BY u.email`
}

async function run_remote_sql({ sql }: { sql: string }) {
	const { app_dir } = apps_config.ontology
	const process = Bun.spawn(['bunx', 'wrangler', 'd1', 'execute', 'DB_Auth', '--remote', '--command', sql], {
		cwd: join(app_dir),
		stdout: 'inherit',
		stderr: 'inherit',
	})
	if (await process.exited !== 0) {
		console.error('❌ wrangler failed (see output above)')
		globalThis.process.exit(1)
	}
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	const apply = args.includes('--apply')
	const permissions_arg = args.find(arg => arg.startsWith('--permissions='))
	const permissions = permissions_arg ? permissions_arg.slice('--permissions='.length).split(',') : DEFAULT_PERMISSIONS
	const user_args = args.filter(arg => !arg.startsWith('--'))

	if (user_args.length === 0) {
		console.error('Usage: bun scripts/dx/grant_remote_permission.ts [--apply] [--permissions=A,B] <email[=Name]>...')
		console.error(`       Default permissions: ${DEFAULT_PERMISSIONS.join(',')}. Without --apply, only prints the SQL.`)
		process.exit(1)
	}

	const users = user_args.map(arg => parse_user({ arg }))
	const sql = build_grant_sql({ users, permissions })

	if (!apply) {
		console.log(`${sql}\n\n⚠️  Dry run against the production DB_Auth. Re-run with --apply to execute.`)
		process.exit(0)
	}

	await run_remote_sql({ sql })
	console.log('🔍 Verifying...')
	await run_remote_sql({ sql: build_verify_sql({ users }) })
}
