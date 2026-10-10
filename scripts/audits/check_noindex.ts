import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')
const apps_dir = join(root_dir, 'apps')

// Where this check's rationale and remediation steps are documented.
const DOC_LINK = 'packages/noindex/src/index.ts'

// The only apps search engines should index. Every other SvelteKit app is a tool or API and must
// send X-Robots-Tag: noindex, so a new app is private until someone adds it here on purpose.
const INDEXABLE_APPS = new Set(['www'])

export type SvelteKitApp = {
	readonly name: string
	readonly hooks_path: string
	/** null when the app has no src/hooks.server.ts. */
	readonly hooks_content: string | null
}

export type NoindexFinding = {
	readonly app_name: string
	readonly file_path: string
	readonly severity: 'warning' | 'error'
	readonly message: string
}

const NOINDEX_IMPORT_PATTERN = /from\s+['"]@tabitha\/noindex['"]/
const NOINDEX_IN_SEQUENCE_PATTERN = /sequence\([^)]*\bnoindex_handle\b/

export function find_noindex_findings(app: SvelteKitApp): NoindexFinding[] {
	const content = app.hooks_content ?? ''
	const imports_noindex = NOINDEX_IMPORT_PATTERN.test(content)
	const finding = ({ severity, message }: {
		severity: NoindexFinding['severity']
		message: string
	}) => [{ app_name: app.name, file_path: app.hooks_path, severity, message }]

	if (INDEXABLE_APPS.has(app.name)) {
		return imports_noindex
			? finding({ severity: 'error', message: `apps/${app.name} is a public, indexable site but uses @tabitha/noindex, which hides it from search engines. Remove it, or drop "${app.name}" from INDEXABLE_APPS if the app is no longer public.` })
			: []
	}

	if (!imports_noindex || !NOINDEX_IN_SEQUENCE_PATTERN.test(content)) {
		return finding({ severity: 'warning', message: `apps/${app.name} is a tool/API app but doesn't put noindex_handle from @tabitha/noindex in its handle sequence, so search engines may index it. Add it first in sequence(...), or add "${app.name}" to INDEXABLE_APPS if it's meant to be public.` })
	}

	return []
}

async function get_sveltekit_apps(): Promise<SvelteKitApp[]> {
	const entries = await readdir(apps_dir, { withFileTypes: true })
	const apps: SvelteKitApp[] = []
	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		// Only SvelteKit apps serve pages or API routes through hooks; plain Workers (scheduler) don't.
		if (!existsSync(join(apps_dir, entry.name, 'src', 'routes'))) continue

		const hooks_path = join(apps_dir, entry.name, 'src', 'hooks.server.ts')
		const hooks_content = existsSync(hooks_path) ? await readFile(hooks_path, 'utf-8') : null
		apps.push({ name: entry.name, hooks_path, hooks_content })
	}
	return apps
}

async function audit_noindex() {
	console.log(`
============================================================
    🔎 TaBiThA Search-Indexing (noindex) Audit
============================================================
`)

	const apps = await get_sveltekit_apps()
	console.log(`🔍 Checking ${apps.length} SvelteKit app(s); indexable: ${[...INDEXABLE_APPS].join(', ')}\n`)

	const findings = apps.flatMap(find_noindex_findings)
	if (findings.length === 0) {
		console.log('✅ 100% Clean! Every tool/API app sends noindex, and every public site stays indexable.\n')
		return true
	}

	const is_ci = process.env.GITHUB_ACTIONS === 'true'
	for (const f of findings) {
		const rel_path = relative(root_dir, f.file_path)
		console.log(`[${f.severity === 'error' ? '❌' : '⚠️'} noindex: ${f.app_name}]`)
		console.log(`  📄 ${rel_path}`)
		console.log(`  💡 ${f.message}`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::${f.severity} file=${rel_path},title=noindex (${f.app_name})::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${findings.length} finding(s) across ${apps.length} app(s).\n`)
	return false
}

if (import.meta.main) {
	const passed = await audit_noindex()
	if (!passed) {
		process.exit(1)
	}
}
