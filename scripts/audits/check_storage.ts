import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

export type StorageFinding = {
	readonly rule_name: string
	readonly file_path: string
	readonly line_number: number
	readonly snippet: string
	readonly message: string
	readonly severity: 'error' | 'warning'
}

// Where this check's rationale and remediation steps are documented.
const DOC_LINK = 'README.md#verification--testing'

const DOCUMENT_COOKIE_REGEX = /\bdocument\.cookie\b/
const SENSITIVE_STORAGE_KEY_REGEX = /(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*['"`]([^'"`]*(?:token|secret|jwt|api_?key|auth_?key|password|private_?key|session_?id|access_?token|refresh_?token|id_?token|credential)[^'"`]*)['"`]/i
const SENSITIVE_PERSISTED_KEY_REGEX = /\bpersisted\s*(?:<[^>]+>)?\s*\(\s*['"`]([^'"`]*(?:token|secret|jwt|api_?key|auth_?key|password|private_?key|session_?id|access_?token|refresh_?token|id_?token|credential)[^'"`]*)['"`]/i
const COOKIE_HTTPONLY_FALSE_REGEX = /cookies\s*\.\s*set\s*\([^)]*httpOnly\s*:\s*false/

export const SENSITIVE_KEY_WORDS = [
	'token',
	'secret',
	'jwt',
	'api_key',
	'apikey',
	'auth_key',
	'password',
	'private_key',
	'session_id',
	'access_token',
	'refresh_token',
	'id_token',
	'credential',
] as const

async function get_scannable_source_files(dir: string): Promise<string[]> {
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
				entry.name === '.git' ||
				entry.name === 'paraglide'
			) {
				continue
			}
			files.push(...await get_scannable_source_files(full_path))
		} else if (
			(entry.name.endsWith('.ts') ||
				entry.name.endsWith('.js') ||
				entry.name.endsWith('.svelte')) &&
			!entry.name.endsWith('.d.ts') &&
			!entry.name.endsWith('.test.ts') &&
			!entry.name.endsWith('.spec.ts') &&
			!entry.name.endsWith('.spec.js')
		) {
			files.push(full_path)
		}
	}
	return files
}

export function analyze_file_storage_rules({ file_path, content }: {
	file_path: string
	content: string
}): StorageFinding[] {
	const findings: StorageFinding[] = []
	const lines = content.split('\n')

	lines.forEach((line, idx) => {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return

		const line_num = idx + 1

		// Rule 1: Disallow client-side document.cookie
		if (DOCUMENT_COOKIE_REGEX.test(line)) {
			findings.push({
				rule_name: 'No Direct document.cookie',
				file_path,
				line_number: line_num,
				snippet: trimmed,
				message: 'Direct usage of document.cookie is prohibited. Manage session cookies server-side via SvelteKit hooks with HttpOnly, Secure, and SameSite attributes.',
				severity: 'error',
			})
		}

		// Rule 2: Ban sensitive credentials/tokens in localStorage / sessionStorage
		const storage_match = line.match(SENSITIVE_STORAGE_KEY_REGEX)
		if (storage_match) {
			const matched_key = storage_match[1]
			findings.push({
				rule_name: 'No Sensitive Storage Keys',
				file_path,
				line_number: line_num,
				snippet: trimmed,
				message: `Sensitive credential/token key "${matched_key}" detected in client storage. Never store tokens, passwords, or secrets in localStorage or sessionStorage.`,
				severity: 'error',
			})
		}

		// Rule 3: Ban sensitive keys in persisted() stores
		const persisted_match = line.match(SENSITIVE_PERSISTED_KEY_REGEX)
		if (persisted_match) {
			const matched_key = persisted_match[1]
			findings.push({
				rule_name: 'No Sensitive Storage Keys',
				file_path,
				line_number: line_num,
				snippet: trimmed,
				message: `Sensitive credential/token key "${matched_key}" detected in persisted store. Never store tokens or secrets in client storage.`,
				severity: 'error',
			})
		}

		// Rule 4: Disallow explicit httpOnly: false in cookies.set
		if (COOKIE_HTTPONLY_FALSE_REGEX.test(line)) {
			findings.push({
				rule_name: 'Enforce HttpOnly Cookies',
				file_path,
				line_number: line_num,
				snippet: trimmed,
				message: 'Explicitly setting "httpOnly: false" on server cookies exposes them to client-side XSS theft. Cookies must remain HttpOnly.',
				severity: 'error',
			})
		}
	})

	return findings
}

export async function scan_storage_hygiene(): Promise<{ scanned: number; errors: StorageFinding[]; warnings: StorageFinding[] }> {
	const search_dirs = [
		join(root_dir, 'apps'),
		join(root_dir, 'packages'),
	]

	const all_files = (await Promise.all(search_dirs.map(get_scannable_source_files))).flat()

	const all_findings: StorageFinding[] = []

	for (const file_path of all_files) {
		try {
			const content = await readFile(file_path, 'utf-8')
			const file_findings = analyze_file_storage_rules({ file_path, content })
			all_findings.push(...file_findings)
		} catch {
			// Skip unreadable files
		}
	}

	const errors = all_findings.filter(f => f.severity === 'error')
	const warnings = all_findings.filter(f => f.severity === 'warning')

	return {
		scanned: all_files.length,
		errors,
		warnings,
	}
}

async function audit_storage() {
	console.log(`
============================================================
      🍪 TaBiThA Storage & Cookie Security Linter        
============================================================
`)

	const result = await scan_storage_hygiene()
	const total_findings = result.errors.length + result.warnings.length

	console.log(`🔍 Scanning ${result.scanned} source file(s) for storage hygiene & cookie best practices...\n`)

	if (total_findings === 0) {
		console.log('✅ 100% Clean! All client storage and cookie configurations adhere to security best practices.\n')
		return true
	}

	console.log(`❌ Detected ${total_findings} storage/cookie security observation(s):\n`)

	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	for (const f of [...result.errors, ...result.warnings]) {
		const rel_path = relative(root_dir, f.file_path)
		console.log(`[Storage Security ${f.severity.toUpperCase()}: ${f.rule_name}]`)
		console.log(`  📄 ${rel_path}:${f.line_number}`)
		console.log(`  💡 ${f.message}`)
		console.log(`  🔍 Snippet: "${f.snippet}"`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			const annotation_type = f.severity === 'error' ? 'error' : 'warning'
			console.log(`::${annotation_type} file=${rel_path},line=${f.line_number},title=Storage Security (${f.rule_name})::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${result.errors.length} error(s), ${result.warnings.length} warning(s) across ${result.scanned} files.\n`)
	return result.errors.length === 0
}

if (import.meta.main) {
	const passed = await audit_storage()
	if (!passed) {
		process.exit(1)
	}
}
