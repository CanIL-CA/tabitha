import { existsSync, readFileSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Database } from 'bun:sqlite'
import { $ } from 'bun'
import type { AiGatewayConfig } from '@tabitha/ai'
import { parse_wrangler_jsonc } from './db_load'
import { forced_local_value, parse_env_file } from './setup_env'
import { probe_gateway_token, type GatewayTokenStatus } from './lib/ai_gateway_token'
import { is_claude_cli_available, list_installed_plugin_ids, read_project_plugins } from './lib/claude_plugins'
import { check_cloudflare_configs } from '../audits/check_cloudflare'
import { sync_readme_badges } from '../audits/check_readme_badges'
import { scan_secrets } from '../audits/check_secrets'

type DiagnosticResult = {
	category: string
	name: string
	status: 'PASS' | 'WARN' | 'FAIL'
	message: string
	fix?: string
}

// Which D1 binding(s) each app has, and which table in each to sanity-check for row count. An app
// can bind multiple databases (e.g. ontology's DB_Auth) without every one needing a check here --
// only bindings worth probing are listed. `binding_prefix` checks every binding matching the
// prefix rather than one exact name -- targets has one D1 binding per target-language project
// (docs/decisions/0012-per-project-targets-databases.md), resolved from wrangler.jsonc itself
// rather than a separate hardcoded project list, so a new project needs no change here.
// Returns true if `version` is >= `minimum`, comparing dotted numeric segments (e.g. "1.4.3" vs "1.4.0").
function version_at_least(version: string, minimum: string): boolean {
	const v = version.split('.').map(Number)
	const m = minimum.split('.').map(Number)
	for (let i = 0; i < Math.max(v.length, m.length); i++) {
		const diff = (v[i] ?? 0) - (m[i] ?? 0)
		if (diff !== 0) return diff > 0
	}
	return true
}

type DbCheck = { table: string } & ({ binding: string } | { binding_prefix: string })
const APPS: { name: string, port: number, db_check?: DbCheck }[] = [
	{ name: 'ontology', port: 3056, db_check: { binding: 'DB_Ontology', table: 'Concepts' } },
	{ name: 'targets', port: 1382, db_check: { binding_prefix: 'DB_Targets_', table: 'Text' } },
	{ name: 'sources', port: 1947, db_check: { binding: 'DB_Sources', table: 'Sources' } },
	{ name: 'editor', port: 1337 },
	{ name: 'copilot', port: 9000 },
	{ name: 'www', port: 1455 },
]

async function check_runtimes(): Promise<DiagnosticResult[]> {
	const results: DiagnosticResult[] = []

	// 1. Node.js -- only genuinely required on Windows, where db_load.ts shells out to a real
	// `node` binary to work around an unresolved Bun-on-Windows stdio bug (see ADR 0011). Every
	// other platform runs entirely under Bun, so a missing Node.js there is informational, not
	// blocking.
	const node_required = platform() === 'win32'
	try {
		const node_proc = await $`node -v`.quiet()
		const node_version = node_proc.text().trim()
		const major = parseInt(node_version.replace(/^v/, '').split('.')[0], 10)
		if (major >= 22) {
			results.push({
				category: 'Runtimes',
				name: 'Node.js Engine',
				status: 'PASS',
				message: `${node_version} (>= v22 required)`,
			})
		} else {
			results.push({
				category: 'Runtimes',
				name: 'Node.js Engine',
				status: node_required ? 'FAIL' : 'WARN',
				message: `${node_version} (v22+ required)`,
				fix: 'Install Node.js 22+ using nvm, fnm, or volta',
			})
		}
	} catch {
		results.push({
			category: 'Runtimes',
			name: 'Node.js Engine',
			status: node_required ? 'FAIL' : 'WARN',
			message: node_required ? 'Not found in PATH' : 'Not found in PATH (only required on Windows, for db:load -- see ADR 0011)',
			fix: 'Install Node.js 22+ from https://nodejs.org',
		})
	}

	// 2. Bun -- compared against .bun-version (the same file CI's setup-bun action reads) as a
	// minimum, not an exact match, so routine Bun patch releases don't trip a false alarm.
	try {
		const bun_proc = await $`bun -v`.quiet()
		const bun_version = bun_proc.text().trim()
		const min_version = readFileSync(join(process.cwd(), '.bun-version'), 'utf-8').trim()

		if (version_at_least(bun_version, min_version)) {
			results.push({
				category: 'Runtimes',
				name: 'Bun Runtime',
				status: 'PASS',
				message: `v${bun_version} (>= v${min_version} required)`,
			})
		} else {
			results.push({
				category: 'Runtimes',
				name: 'Bun Runtime',
				status: 'WARN',
				message: `v${bun_version} (v${min_version}+ required)`,
				fix: 'Run `bun upgrade` to update to the version this repo expects',
			})
		}
	} catch {
		results.push({
			category: 'Runtimes',
			name: 'Bun Runtime',
			status: 'FAIL',
			message: 'Not found in PATH',
			fix: 'Install Bun from https://bun.sh (`curl -fsSL https://bun.sh/install | bash`)',
		})
	}

	// 3. SQLite3 CLI
	try {
		const sqlite_proc = await $`sqlite3 --version`.quiet()
		const sqlite_version = sqlite_proc.text().trim().split(' ')[0]
		results.push({
			category: 'Runtimes',
			name: 'SQLite3 Engine',
			status: 'PASS',
			message: `v${sqlite_version}`,
		})
	} catch {
		const os_type = platform()
		const sqlite_fix = os_type === 'win32'
			? 'Install SQLite via winget (`winget install sqlite.sqlite`) or chocolatey (`choco install sqlite`)'
			: os_type === 'darwin'
				? 'Install SQLite via Homebrew (`brew install sqlite`) or Xcode Command Line Tools'
				: 'Install SQLite via apt (`sudo apt-get install sqlite3`)'

		results.push({
			category: 'Runtimes',
			name: 'SQLite3 Engine',
			status: 'FAIL',
			message: 'Not found in PATH',
			fix: sqlite_fix,
		})
	}

	return results
}

// Every app's committed .env marks a "# SECRETS" section (see e.g. apps/ontology/.env) whose keys
// are deliberately left blank in the template -- real values belong only in the gitignored
// .env.local. Everything above that marker (open config) is allowed to be blank too, either
// because it already carries a real committed value or because scripts/dx/setup_env.ts forces a
// specific local-dev value for it -- only keys under the marker are ever "required".
function get_required_secret_keys(env_template_content: string): string[] {
	const keys: string[] = []
	let in_secrets_section = false

	for (const raw_line of env_template_content.split('\n')) {
		const line = raw_line.trim()
		if (line === '# SECRETS') {
			in_secrets_section = true
			continue
		}
		if (!in_secrets_section || !line || line.startsWith('#')) continue

		const eq_idx = line.indexOf('=')
		if (eq_idx !== -1) keys.push(line.slice(0, eq_idx).trim())
	}

	return keys
}

// An .env.local written before setup_env.ts learned a key keeps working until that key matters:
// it lacks the key entirely, or holds a value the script would now force (e.g. a blank
// OAUTH_REDIRECT_PROXY_URL), which surfaces as a confusing failure like Google's
// redirect_uri_mismatch. Keys under "# SECRETS" are the secrets check's job, not this one's.
function get_stale_local_keys(env_template_content: string, env_local_content: string): string[] {
	const local_vars = parse_env_file(env_local_content)
	const secret_keys = new Set(get_required_secret_keys(env_template_content))

	return [...parse_env_file(env_template_content).keys()].filter(key => {
		if (secret_keys.has(key)) return false
		const forced_value = forced_local_value(key)
		return forced_value === undefined ? !local_vars.has(key) : local_vars.get(key) !== forced_value
	})
}

async function check_env_files(): Promise<DiagnosticResult[]> {
	const results: DiagnosticResult[] = []
	const missing_apps = APPS
		.filter(app => !existsSync(join(process.cwd(), 'apps', app.name, '.env.local')))
		.map(app => app.name)

	if (missing_apps.length === 0) {
		results.push({
			category: 'Environment',
			name: 'App .env.local Files',
			status: 'PASS',
			message: `All ${APPS.length} applications configured with local service endpoints`,
		})
	} else {
		results.push({
			category: 'Environment',
			name: 'App .env.local Files',
			status: 'WARN',
			message: `Missing in: ${missing_apps.join(', ')}`,
			fix: 'Run `bun run setup:env` to generate local environment configs',
		})
	}

	const unpopulated: string[] = []
	for (const app of APPS) {
		const env_template_path = join(process.cwd(), 'apps', app.name, '.env')
		const env_local_path = join(process.cwd(), 'apps', app.name, '.env.local')
		if (!existsSync(env_template_path) || !existsSync(env_local_path)) continue // already flagged above

		const required_keys = get_required_secret_keys(readFileSync(env_template_path, 'utf-8'))
		if (required_keys.length === 0) continue

		const local_vars = parse_env_file(readFileSync(env_local_path, 'utf-8'))
		const blank_keys = required_keys.filter(key => !local_vars.get(key)?.trim())
		if (blank_keys.length > 0) unpopulated.push(`${app.name} (${blank_keys.join(', ')})`)
	}

	if (unpopulated.length === 0) {
		results.push({
			category: 'Environment',
			name: 'App .env.local Secrets',
			status: 'PASS',
			message: 'All required secret values populated',
		})
	} else {
		results.push({
			category: 'Environment',
			name: 'App .env.local Secrets',
			status: 'WARN',
			message: `Missing or blank: ${unpopulated.join('; ')}`,
			fix: 'See the "# SECRETS" section in that app\'s .env for where to obtain each value, then set it in the app\'s .env.local',
		})
	}

	const stale: string[] = []
	for (const app of APPS) {
		const env_template_path = join(process.cwd(), 'apps', app.name, '.env')
		const env_local_path = join(process.cwd(), 'apps', app.name, '.env.local')
		if (!existsSync(env_template_path) || !existsSync(env_local_path)) continue

		const stale_keys = get_stale_local_keys(readFileSync(env_template_path, 'utf-8'), readFileSync(env_local_path, 'utf-8'))
		if (stale_keys.length > 0) stale.push(`${app.name} (${stale_keys.join(', ')})`)
	}

	if (stale.length === 0) {
		results.push({
			category: 'Environment',
			name: 'App .env.local Freshness',
			status: 'PASS',
			message: 'All .env.local files match the current .env templates',
		})
	} else {
		results.push({
			category: 'Environment',
			name: 'App .env.local Freshness',
			status: 'WARN',
			message: `Out of date: ${stale.join('; ')}`,
			fix: 'Run `bun run setup:env` to regenerate them (your own values are preserved)',
		})
	}

	return results
}

const unquote = (value: string): string => value.replace(/^(["'])(.*)\1$/, '$2')

// Presence alone isn't enough: every app can hold the same revoked token and still pass the
// secrets check above, surfacing only as a 401 on the first AI request. Each distinct token is
// probed once against the live gateway; apps without a token are skipped, since the secrets
// check already reports them (and CI never has one).
async function check_ai_gateway_tokens(): Promise<DiagnosticResult[]> {
	const apps_by_token = new Map<string, { gateway: AiGatewayConfig, app_names: string[] }>()

	for (const app of APPS) {
		const env_template_path = join(process.cwd(), 'apps', app.name, '.env')
		const env_local_path = join(process.cwd(), 'apps', app.name, '.env.local')
		if (!existsSync(env_template_path) || !existsSync(env_local_path)) continue

		const env_vars = new Map([
			...parse_env_file(readFileSync(env_template_path, 'utf-8')),
			...parse_env_file(readFileSync(env_local_path, 'utf-8')),
		])
		const read_var = (key: string): string => unquote(env_vars.get(key) ?? '')

		const token = read_var('AI_GATEWAY_TOKEN')
		if (!token) continue

		const existing = apps_by_token.get(token)
		if (existing) {
			existing.app_names.push(app.name)
			continue
		}

		apps_by_token.set(token, {
			gateway: {
				account_id: read_var('CLOUDFLARE_ACCOUNT_ID'),
				token,
				project: read_var('GEMINI_PROJECT_ID'),
				location: read_var('GEMINI_LOCATION'),
			},
			app_names: [app.name],
		})
	}

	const results: DiagnosticResult[] = []
	for (const [token, { gateway, app_names }] of apps_by_token) {
		const name = `AI Gateway Token (…${token.slice(-4)})`
		const used_by = `used by ${app_names.join(', ')}`
		const env_local_paths = app_names.map(app_name => `apps/${app_name}/.env.local`).join(', ')

		try {
			const { status, http_code } = await probe_gateway_token(gateway)
			const result_by_status: Record<GatewayTokenStatus, DiagnosticResult> = {
				valid: { category: 'Environment', name, status: 'PASS', message: `Accepted by the AI Gateway (${used_by})` },
				rejected: {
					category: 'Environment',
					name,
					status: 'FAIL',
					message: `Rejected by the AI Gateway with HTTP ${http_code} (${used_by})`,
					fix: `Get the current AI_GATEWAY_TOKEN from the team vault, set it in ${env_local_paths}, then restart those dev servers`,
				},
				unexpected: {
					category: 'Environment',
					name,
					status: 'WARN',
					message: `Unexpected HTTP ${http_code} from the AI Gateway (${used_by})`,
					fix: 'Check the gateway\'s logs in the Cloudflare dashboard (AI → AI Gateway → tabitha)',
				},
			}
			results.push(result_by_status[status])
		} catch (err) {
			results.push({
				category: 'Environment',
				name,
				status: 'WARN',
				message: `Could not reach the AI Gateway: ${err instanceof Error ? err.message : err} (${used_by})`,
			})
		}
	}

	return results
}

async function check_local_databases(): Promise<DiagnosticResult[]> {
	const results: DiagnosticResult[] = []

	for (const app of APPS) {
		if (!app.db_check) continue

		const wrangler = parse_wrangler_jsonc(join(process.cwd(), 'apps', app.name, 'wrangler.jsonc'))
		const d1_state_dir = join(process.cwd(), 'apps', app.name, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')

		const entries = (wrangler?.d1_databases ?? []).filter(d1 =>
			'binding_prefix' in app.db_check! ? d1.binding?.startsWith(app.db_check!.binding_prefix) : d1.binding === app.db_check!.binding,
		)

		if (entries.length === 0) {
			results.push({
				category: 'Local Databases',
				name: `D1 Database (${app.name})`,
				status: 'WARN',
				message: `No matching D1 binding found in ${app.name}/wrangler.jsonc`,
				fix: 'Check the app\'s wrangler.jsonc d1_databases configuration',
			})
			continue
		}

		for (const entry of entries) {
			const label = `D1 Database (${app.name}: ${entry.binding})`

			// Matches db_load.ts's own key derivation -- the file each binding's snapshot is actually
			// imported into, not a guess at "the" .sqlite file in a directory that now holds several.
			const db_hash = createHash('sha256').update(entry.database_id).digest('hex')
			const sqlite_path = join(d1_state_dir, `${db_hash}.sqlite`)

			if (!existsSync(sqlite_path)) {
				results.push({
					category: 'Local Databases',
					name: label,
					status: 'WARN',
					message: 'No local SQLite database found in .wrangler state',
					fix: `Run \`bun run db:load\` or \`bun tools/databases/src/load_d1.ts ${app.name}\``,
				})
				continue
			}

			try {
				const db = new Database(sqlite_path)
				const count_res = db.query(`SELECT count(*) as count FROM ${app.db_check.table}`).get() as { count: number } | null
				db.close(true)

				const count = count_res?.count ?? 0
				if (count > 0) {
					results.push({
						category: 'Local Databases',
						name: label,
						status: 'PASS',
						message: `Loaded (${count.toLocaleString()} rows in '${app.db_check.table}')`,
					})
				} else {
					results.push({
						category: 'Local Databases',
						name: label,
						status: 'WARN',
						message: `Database exists but table '${app.db_check.table}' has 0 rows`,
						fix: 'Run `bun run db:load` to populate tables',
					})
				}
			} catch (err) {
				results.push({
					category: 'Local Databases',
					name: label,
					status: 'WARN',
					message: `Error querying SQLite: ${err instanceof Error ? err.message : err}`,
					fix: 'Run `bun run db:load` to re-bootstrap SQLite snapshot',
				})
			}
		}
	}

	return results
}

async function check_security_and_cloudflare(): Promise<DiagnosticResult[]> {
	const results: DiagnosticResult[] = []

	// 1. Secrets Scanner
	try {
		const secret_res = await scan_secrets()
		if (secret_res.found === 0) {
			results.push({
				category: 'Quality & Security',
				name: 'Credential & Secret Scanner',
				status: 'PASS',
				message: `${secret_res.scanned} files scanned, 0 secrets detected`,
			})
		} else {
			results.push({
				category: 'Quality & Security',
				name: 'Credential & Secret Scanner',
				status: 'FAIL',
				message: `${secret_res.found} potential secret(s) found in repository!`,
				fix: 'Run `bun run check:secrets` for line-by-line inspection',
			})
		}
	} catch (err) {
		results.push({
			category: 'Quality & Security',
			name: 'Credential & Secret Scanner',
			status: 'WARN',
			message: `Could not run scanner: ${err instanceof Error ? err.message : err}`,
		})
	}

	// 2. Cloudflare Configs Linter
	try {
		const cf_res = await check_cloudflare_configs()
		if (cf_res.valid) {
			results.push({
				category: 'Quality & Security',
				name: 'Cloudflare Wrangler Configs',
				status: 'PASS',
				message: `All ${cf_res.wrangler_config_count} wrangler.jsonc configurations valid`,
			})
		} else {
			results.push({
				category: 'Quality & Security',
				name: 'Cloudflare Wrangler Configs',
				status: 'FAIL',
				message: `${cf_res.errors.length} configuration error(s) found`,
				fix: 'Run `bun run check:cloudflare` for details',
			})
		}
	} catch (err) {
		results.push({
			category: 'Quality & Security',
			name: 'Cloudflare Wrangler Configs',
			status: 'WARN',
			message: `Could not check Cloudflare configs: ${err instanceof Error ? err.message : err}`,
		})
	}

	// 3. README Badges Sync
	try {
		const badge_res = await sync_readme_badges({ should_write: false })
		if (badge_res.is_synced) {
			results.push({
				category: 'Quality & Security',
				name: 'README Badges Sync',
				status: 'PASS',
				message: 'All README badges in sync with package.json',
			})
		} else {
			results.push({
				category: 'Quality & Security',
				name: 'README Badges Sync',
				status: 'FAIL',
				message: `${badge_res.findings.length} badge(s) out of sync with package.json`,
				fix: 'Run `bun scripts/audits/check_readme_badges.ts --fix` to sync badges',
			})
		}
	} catch (err) {
		results.push({
			category: 'Quality & Security',
			name: 'README Badges Sync',
			status: 'WARN',
			message: `Could not check README badges: ${err instanceof Error ? err.message : err}`,
		})
	}

	return results
}

// Only for developers who use Claude Code: without the CLI there is nothing to report.
async function check_claude_plugins(): Promise<DiagnosticResult[]> {
	const project_plugins = read_project_plugins({ root_dir: process.cwd() })
	if (project_plugins.length === 0 || !is_claude_cli_available()) return []

	const installed_ids = await list_installed_plugin_ids()
	if (!installed_ids) {
		return [{ category: 'Claude Code', name: 'Project plugins', status: 'WARN', message: 'Could not list installed Claude Code plugins' }]
	}

	return project_plugins.map((plugin): DiagnosticResult => {
		if (installed_ids.has(plugin.plugin_id)) {
			return { category: 'Claude Code', name: plugin.plugin_id, status: 'PASS', message: 'Installed' }
		}

		return {
			category: 'Claude Code',
			name: plugin.plugin_id,
			status: 'WARN',
			message: 'Enabled in .claude/settings.json but not installed on this machine',
			fix: `Run \`bun run setup\`, or install it from Claude Code with \`/plugin install ${plugin.plugin_id}\``,
		}
	})
}

export async function run_doctor(): Promise<{ all_passed: boolean; fixes: string[] }> {
	console.log(`
============================================================
              🩺 TaBiThA Monorepo Doctor
============================================================
`)

	const results: DiagnosticResult[] = [
		...await check_runtimes(),
		...await check_env_files(),
		...await check_ai_gateway_tokens(),
		...await check_local_databases(),
		...await check_security_and_cloudflare(),
		...await check_claude_plugins(),
	]

	// Group by category
	const categories = [...new Set(results.map(r => r.category))]
	const fixes: { name: string; fix: string }[] = []

	for (const cat of categories) {
		console.log(`📌 ${cat}:`)
		const cat_results = results.filter(r => r.category === cat)
		for (const r of cat_results) {
			const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌'
			console.log(`   ${icon} ${r.name.padEnd(30)} ${r.message}`)
			if (r.fix) {
				fixes.push({ name: r.name, fix: r.fix })
			}
		}
		console.log('')
	}

	const pass_count = results.filter(r => r.status === 'PASS').length
	const warn_count = results.filter(r => r.status === 'WARN').length
	const fail_count = results.filter(r => r.status === 'FAIL').length

	console.log('============================================================')
	console.log(`Diagnostic Summary: ${pass_count} Passed | ${warn_count} Warnings | ${fail_count} Failed`)

	if (fixes.length > 0) {
		console.log('\n💡 Recommended Actions:')
		for (const f of fixes) {
			console.log(`   • ${f.name}:`)
			console.log(`     👉 ${f.fix}`)
		}
	} else {
		console.log('\n✨ Everything is healthy and configured! You are ready to build.')
	}
	console.log('============================================================\n')

	return {
		all_passed: fail_count === 0,
		fixes: fixes.map(f => f.fix),
	}
}

if (import.meta.main) {
	const { all_passed } = await run_doctor()
	if (!all_passed) {
		process.exit(1)
	}
}
