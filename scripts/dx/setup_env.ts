import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const script_dir = dirname(fileURLToPath(import.meta.url))
const root_dir = resolve(script_dir, '../..')
const apps_dir = join(root_dir, 'apps')

const local_hosts: Record<string, string> = {
	PUBLIC_ONTOLOGY_API_HOST: 'http://localhost:3056',
	PUBLIC_TARGETS_API_HOST: 'http://localhost:1382',
	PUBLIC_SOURCES_API_HOST: 'http://localhost:1947',
	PUBLIC_EDITOR_API_HOST: 'http://localhost:1337',
	PUBLIC_COPILOT_API_HOST: 'http://localhost:9000',
}

export function parse_env_file(content: string): Map<string, string> {
	const result = new Map<string, string>()
	const lines = content.split('\n')

	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue

		const eq_idx = trimmed.indexOf('=')
		if (eq_idx === -1) continue

		const key = trimmed.slice(0, eq_idx).trim()
		const value = trimmed.slice(eq_idx + 1).trim()
		result.set(key, value)
	}

	return result
}

/**
 * Dev-environment identifiers for keys whose committed `.env` value belongs to production. They
 * aren't secrets (see `.env`), so they're seeded into `.env.local`; a developer's own value is kept,
 * but production's is replaced.
 */
export const dev_defaults: Record<string, string> = {
	GOOGLE_OAUTH_CLIENT_ID: '839335496347-8skv8tif4auhth084h7bl5sas0vilnl4.apps.googleusercontent.com',
}

/**
 * The value a key always has in a local `.env.local`, or `undefined` when the developer's own
 * value is kept. Shared with `doctor`, which flags an `.env.local` that has drifted from these.
 */
export function forced_local_value(key: string): string | undefined {
	// Point known service hosts at their local ports
	if (key in local_hosts) return local_hosts[key]

	// Better Auth's OAuth proxy target only makes sense for a genuine Cloudflare deployment (prod
	// or preview); set locally, Google would be sent a redirect_uri it has no client registered for
	if (key === 'OAUTH_REDIRECT_PROXY_URL') return ''

	// Browsers reject a cookie for tabitha.bible from localhost, where a host-only cookie already
	// reaches every app's port
	if (key === 'AUTH_COOKIE_DOMAIN') return ''

	// Trust cross-app localhost origins for CORS in local dev only
	if (key === 'PUBLIC_CORS_ALLOW_LOCALHOST') return 'true'

	// Local dev and CI e2e runs fire fast, unpaced request bursts that a real-world-abuse
	// threshold isn't meant to survive -- disable rate limiting locally only
	if (key === 'PUBLIC_RATE_LIMIT_DISABLED') return 'true'

	// Sibling apps run under `vite dev` locally, which a service binding can't reach, so cross-app
	// calls go to their local ports over HTTP instead
	if (key === 'PUBLIC_SERVICE_BINDINGS_DISABLED') return 'true'

	return undefined
}

/**
 * The one local BETTER_AUTH_SECRET every app shares, so a session one app signs is valid in the
 * others, as in production (ADR 0027): the first app's existing one, or a new random one.
 */
export function local_auth_secret({ env_local_contents }: { env_local_contents: string[] }): string {
	for (const content of env_local_contents) {
		const value = parse_env_file(content).get('BETTER_AUTH_SECRET')
		if (value) return value
	}
	return randomBytes(32).toString('hex')
}

function generate_local_env_content({ template_content, existing_content, auth_secret }: {
	template_content: string
	existing_content?: string
	auth_secret: string
}): string {
	const existing_vars = existing_content ? parse_env_file(existing_content) : new Map<string, string>()
	const lines = template_content.split('\n')
	const output_lines: string[] = []

	for (const line of lines) {
		const trimmed = line.trim()

		// Preserve comments and empty lines
		if (!trimmed || trimmed.startsWith('#')) {
			output_lines.push(line)
			continue
		}

		const eq_idx = trimmed.indexOf('=')
		if (eq_idx === -1) {
			output_lines.push(line)
			continue
		}

		const key = trimmed.slice(0, eq_idx).trim()

		// Priority 1: Keys whose local-dev value is fixed, overriding any stale value a developer
		// might already have from a prior run
		const forced_value = forced_local_value(key)
		if (forced_value !== undefined) {
			output_lines.push(`${key}=${forced_value}`)
			continue
		}

		// Priority 2: Production's identifier is never wanted locally; seed the dev one unless the
		// developer already set their own
		const template_value = trimmed.slice(eq_idx + 1).trim()
		const existing_value = existing_vars.get(key)
		if (key in dev_defaults) {
			const own_value = existing_value && existing_value !== template_value ? existing_value : undefined
			output_lines.push(`${key}=${own_value ?? dev_defaults[key]}`)
			continue
		}

		// Priority 3: Every app gets the same local BETTER_AUTH_SECRET
		if (key === 'BETTER_AUTH_SECRET') {
			output_lines.push(`BETTER_AUTH_SECRET=${auth_secret}`)
			continue
		}

		// Priority 4: If the developer already supplied a custom value in existing .env.local, preserve it
		if (existing_value) {
			output_lines.push(`${key}=${existing_value}`)
			continue
		}

		// Priority 5: Fall back to the template line
		output_lines.push(line)
	}

	return output_lines.join('\n')
}

export async function setup_env() {
	console.log('\n🔧 [TaBiThA Setup] Configuring local environment variables and service endpoints...\n')

	const app_dirs = readdirSync(apps_dir, { withFileTypes: true })
		.filter(d => d.isDirectory())

	let configured_count = 0

	const auth_secret = local_auth_secret({
		env_local_contents: app_dirs
			.map(app_dir => join(apps_dir, app_dir.name, '.env.local'))
			.filter(env_local => existsSync(env_local))
			.map(env_local => readFileSync(env_local, 'utf-8')),
	})

	for (const app_dir of app_dirs) {
		const app_name = app_dir.name
		const app_path = join(apps_dir, app_name)
		const env_template = join(app_path, '.env')
		const env_local = join(app_path, '.env.local')

		if (!existsSync(env_template)) {
			console.log(`   ℹ️  ${app_name}: No .env template found (skipping).`)
			continue
		}

		const template_content = readFileSync(env_template, 'utf-8')
		const existing_content = existsSync(env_local) ? readFileSync(env_local, 'utf-8') : undefined

		const new_content = generate_local_env_content({ template_content, existing_content, auth_secret })
		writeFileSync(env_local, new_content, 'utf-8')

		console.log(`   🔗 ${app_name}: Configured .env.local with local port discovery & preserved secrets.`)
		configured_count++
	}

	console.log(`\n🎉 Environment setup complete (${configured_count} .env.local file(s) wired to local dev servers).\n`)
}

if (import.meta.main) {
	await setup_env()
}
