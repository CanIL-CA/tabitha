import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

type SecretFinding = {
	rule_name: string
	file_path: string
	line_number: number
	snippet: string
	message: string
}

// Where this check's rationale and remediation steps are documented.
const DOC_LINK = 'README.md#verification--testing'

const secret_patterns: Array<{ name: string; regex: RegExp; message: string }> = [
	{
		name: 'Private Key',
		regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
		message: 'Cryptographic private key detected.',
	},
	{
		name: 'OpenAI API Key',
		regex: /\b(sk-[a-zA-Z0-9_-]{20,}|sk-proj-[a-zA-Z0-9_-]{20,})\b/,
		message: 'Potential hardcoded OpenAI API key detected.',
	},
	{
		name: 'Google / Gemini API Key',
		regex: /\bAIza[0-9A-Za-z-_]{35}\b/,
		message: 'Potential hardcoded Google / Gemini API key detected.',
	},
	{
		name: 'Anthropic API Key',
		regex: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/,
		message: 'Potential hardcoded Anthropic API key detected.',
	},
	{
		name: 'GitHub Token',
		regex: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{50,})\b/,
		message: 'Potential GitHub Personal Access Token detected.',
	},
	{
		name: 'AWS Access Key',
		regex: /\b(AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/,
		message: 'Potential AWS Access Key ID detected.',
	},
	{
		name: 'Google Service Account',
		regex: /"type":\s*"service_account"/,
		message: 'Google Cloud service account JSON file or credentials detected.',
	},
]

const sensitive_env_keys = [
	'BETTER_AUTH_SECRET',
	'API_KEY_OPENAI',
	'API_KEY_GEMINI',
	'API_KEY_AQUIFER',
	'PHASE1_AI_ASSIST_API_KEY',
	'GEMINI_PRIVATE_KEY',
	'GOOGLE_OAUTH_CLIENT_SECRET',
]

async function get_scannable_files(dir: string): Promise<string[]> {
	if (!existsSync(dir)) return []
	const files: string[] = []
	const entries = await readdir(dir, { withFileTypes: true })
	for (const entry of entries) {
		const full_path = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (
				entry.name === 'node_modules' ||
				entry.name === '.svelte-kit' ||
				entry.name === 'dist' ||
				entry.name === '.wrangler' ||
				entry.name === '.turbo' ||
				entry.name === '.git'
			) {
				continue
			}
			files.push(...await get_scannable_files(full_path))
		} else {
			// Scan source files, env files, config files, workflows
			// Skip gitignored local env files (.env.local, .env.*.local)
			if (entry.name.endsWith('.local') || entry.name.endsWith('.sqlite') || entry.name.endsWith('.sqlite-wal')) {
				continue
			}
			files.push(full_path)
		}
	}
	return files
}

function mask_secret(str: string): string {
	if (str.length <= 8) return '****'
	return str.slice(0, 4) + '****' + str.slice(-4)
}

export async function scan_secrets(): Promise<{ scanned: number; found: number; findings: SecretFinding[] }> {
	const local_findings: SecretFinding[] = []
	const search_dirs = [
		join(root_dir, 'apps'),
		join(root_dir, 'packages'),
		join(root_dir, 'tools'),
		join(root_dir, 'scripts'),
		join(root_dir, '.github'),
	]

	const all_files = (await Promise.all(search_dirs.map(get_scannable_files))).flat()

	for (const file_path of all_files) {
		try {
			const content = await readFile(file_path, 'utf-8')
			const lines = content.split('\n')

			lines.forEach((line, idx) => {
				const trimmed = line.trim()
				if (!trimmed) return

				for (const pattern of secret_patterns) {
					const match = line.match(pattern.regex)
					if (match) {
						local_findings.push({
							rule_name: pattern.name,
							file_path,
							line_number: idx + 1,
							snippet: mask_secret(match[0]),
							message: pattern.message,
						})
					}
				}
			})

			// Check template
			const file_name = file_path.split('/').pop() ?? ''
			if (file_name === '.env') {
				lines.forEach((line, idx) => {
					const trimmed = line.trim()
					if (!trimmed || trimmed.startsWith('#')) return
					const eq_idx = trimmed.indexOf('=')
					if (eq_idx === -1) return
					const key = trimmed.slice(0, eq_idx).trim()
					const val = trimmed.slice(eq_idx + 1).trim()
					if (sensitive_env_keys.includes(key) && val !== '') {
						local_findings.push({
							rule_name: 'Committed .env Secret',
							file_path,
							line_number: idx + 1,
							snippet: `${key}=${mask_secret(val)}`,
							message: `Committed base .env file has populated value for sensitive key "${key}". Base .env must be an empty template.`,
						})
					}
				})
			}
		} catch {
			// Binary file or unreadable, ignore
		}
	}

	return {
		scanned: all_files.length,
		found: local_findings.length,
		findings: local_findings,
	}
}

async function audit_secrets() {
	console.log(`
============================================================
       🛡️ TaBiThA Secret & Credential Security Scanner      
============================================================
`)

	const result = await scan_secrets()

	console.log(`🔍 Scanning ${result.scanned} tracked file(s) for exposed credentials & secrets...\n`)

	if (result.found === 0) {
		console.log('✅ 100% Clean! No exposed secrets, private keys, or credentials detected.\n')
		return true
	}

	console.log(`❌ Detected ${result.found} potential security observation(s):\n`)

	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	for (const f of result.findings) {
		const rel_path = relative(root_dir, f.file_path)
		console.log(`[Security Alert: ${f.rule_name}]`)
		console.log(`  📄 ${rel_path}:${f.line_number}`)
		console.log(`  💡 ${f.message}`)
		console.log(`  🔒 Masked Preview: "${f.snippet}"`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::error file=${rel_path},line=${f.line_number},title=Security Alert (${f.rule_name})::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${result.found} security observation(s) reported across ${result.scanned} files.\n`)
	return false
}

if (import.meta.main) {
	const clean = await audit_secrets()
	if (!clean) {
		process.exit(1)
	}
}
