import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ISO_DATE_REGEX, strip_jsonc_comments } from '@tabitha/types/patterns'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')
const apps_dir = join(root_dir, 'apps')

type CloudflareFinding = {
	app_name: string
	file_path: string
	line_number?: number
	message: string
	severity: 'warning' | 'error'
}

type WranglerConfig = {
	compatibility_flags?: string[]
	compatibility_date?: string
	vars?: Record<string, string>
	d1_databases?: { binding?: string, database_name?: string, database_id?: string }[]
}

// Where this check's rationale and remediation steps are documented.
const DOC_LINK = 'README.md#verification--testing'

const forbidden_var_keys = [
	'BETTER_AUTH_SECRET',
	'API_KEY_AQUIFER',
	'GOOGLE_OAUTH_CLIENT_SECRET',
	'AI_GATEWAY_TOKEN',
]

export async function check_cloudflare_configs(): Promise<{ valid: boolean; errors: CloudflareFinding[]; warnings: CloudflareFinding[]; wrangler_config_count: number }> {
	const local_findings: CloudflareFinding[] = []

	const app_entries = await readdir(apps_dir, { withFileTypes: true })
	const app_dirs = app_entries.filter(d => d.isDirectory()).map(d => d.name)

	let wrangler_config_count = 0
	for (const app_name of app_dirs) {
		const wrangler_path = join(apps_dir, app_name, 'wrangler.jsonc')
		if (!existsSync(wrangler_path)) continue
		wrangler_config_count++

		const raw_content = await readFile(wrangler_path, 'utf-8')
		let config: WranglerConfig

		try {
			const cleaned = strip_jsonc_comments(raw_content)
			config = JSON.parse(cleaned)
		} catch (err) {
			local_findings.push({
				app_name,
				file_path: wrangler_path,
				message: `Failed to parse wrangler.jsonc as valid JSONC: ${err instanceof Error ? err.message : err}`,
				severity: 'error',
			})
			continue
		}

		const flags: string[] = config.compatibility_flags || []
		if (!flags.includes('nodejs_compat')) {
			local_findings.push({
				app_name,
				file_path: wrangler_path,
				message: 'Missing "nodejs_compat" in compatibility_flags.',
				severity: 'warning',
			})
		}

		if (!config.compatibility_date) {
			local_findings.push({
				app_name,
				file_path: wrangler_path,
				message: 'Missing "compatibility_date" property in wrangler.jsonc',
				severity: 'error',
			})
		} else if (!ISO_DATE_REGEX.test(config.compatibility_date)) {
			local_findings.push({
				app_name,
				file_path: wrangler_path,
				message: `Invalid "compatibility_date" format: "${config.compatibility_date}". Expected YYYY-MM-DD.`,
				severity: 'error',
			})
		}

		const vars: Record<string, string> = config.vars || {}
		for (const key of Object.keys(vars)) {
			if (forbidden_var_keys.includes(key)) {
				local_findings.push({
					app_name,
					file_path: wrangler_path,
					message: `Public vars in wrangler.jsonc contains sensitive secret key "${key}". Secrets must be provided via .env.local / Cloudflare dashboard secrets.`,
					severity: 'error',
				})
			}
		}

		if (config.d1_databases && Array.isArray(config.d1_databases)) {
			for (const db of config.d1_databases) {
				if (!db.binding || !db.database_name || !db.database_id) {
					local_findings.push({
						app_name,
						file_path: wrangler_path,
						message: `D1 database definition missing required fields (binding, database_name, or database_id): ${JSON.stringify(db)}`,
						severity: 'warning',
					})
				}
			}
		}
	}

	const errors = local_findings.filter(f => f.severity === 'error')
	const warnings = local_findings.filter(f => f.severity === 'warning')

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		wrangler_config_count,
	}
}

async function audit_cloudflare_configs() {
	console.log(`
============================================================
      ☁️ TaBiThA Cloudflare Workers Configuration Linter    
============================================================
`)

	const result = await check_cloudflare_configs()
	const all_findings = [...result.errors, ...result.warnings]

	if (all_findings.length === 0) {
		console.log(`✅ 100% Valid! All ${result.wrangler_config_count} wrangler.jsonc files comply with Cloudflare Workers best practices.\n`)
		return
	}

	console.log(`⚠️  Detected ${all_findings.length} Cloudflare configuration observation(s):\n`)

	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	for (const f of all_findings) {
		const rel_path = relative(root_dir, f.file_path)
		console.log(`[Cloudflare ${f.severity.toUpperCase()}: ${f.app_name}]`)
		console.log(`  📄 ${rel_path}`)
		console.log(`  💡 ${f.message}`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::warning file=${rel_path},title=Cloudflare Config (${f.app_name})::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${all_findings.length} observation(s) reported across app configurations.\n`)
}

if (import.meta.main) {
	await audit_cloudflare_configs()
}
