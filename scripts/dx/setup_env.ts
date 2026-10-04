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

function generate_local_env_content(template_content: string, existing_content?: string): string {
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

		// Priority 1: If it's a known service host, point it to local port
		if (key in local_hosts) {
			output_lines.push(`${key}=${local_hosts[key]}`)
			continue
		}

		// Priority 2: Auth.js's redirect-proxy target only makes sense for a genuine Cloudflare
		// deployment (prod or preview) -- always force it blank for local dev, overriding any stale
		// value a developer might already have from a prior run
		if (key === 'OAUTH_REDIRECT_PROXY_URL') {
			output_lines.push('OAUTH_REDIRECT_PROXY_URL=')
			continue
		}

		// Priority 3: Trust cross-app localhost origins for CORS in local dev only
		if (key === 'PUBLIC_CORS_ALLOW_LOCALHOST') {
			output_lines.push('PUBLIC_CORS_ALLOW_LOCALHOST=true')
			continue
		}

		// Priority 3b: Local dev and CI e2e runs fire fast, unpaced request bursts that a
		// real-world-abuse threshold isn't meant to survive -- disable rate limiting locally only
		if (key === 'PUBLIC_RATE_LIMIT_DISABLED') {
			output_lines.push('PUBLIC_RATE_LIMIT_DISABLED=true')
			continue
		}

		// Priority 4: If the developer already supplied a custom value in existing .env.local, preserve it
		const existing_value = existing_vars.get(key)
		if (existing_value) {
			output_lines.push(`${key}=${existing_value}`)
			continue
		}

		// Priority 5: If AUTH_SECRET is blank, generate a dedicated random secret for local dev & testing
		if (key === 'AUTH_SECRET') {
			const dev_secret = randomBytes(32).toString('hex')
			output_lines.push(`AUTH_SECRET=${dev_secret}`)
			continue
		}

		// Priority 6: Fall back to the template line
		output_lines.push(line)
	}

	return output_lines.join('\n')
}

export async function setup_env() {
	console.log('\n🔧 [TaBiThA Setup] Configuring local environment variables and service endpoints...\n')

	const app_dirs = readdirSync(apps_dir, { withFileTypes: true })
		.filter(d => d.isDirectory())

	let configured_count = 0

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

		const new_content = generate_local_env_content(template_content, existing_content)
		writeFileSync(env_local, new_content, 'utf-8')

		console.log(`   🔗 ${app_name}: Configured .env.local with local port discovery & preserved secrets.`)
		configured_count++
	}

	console.log(`\n🎉 Environment setup complete (${configured_count} .env.local file(s) wired to local dev servers).\n`)
}

if (import.meta.main) {
	await setup_env()
}
