import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

// Where this check's rationale is documented -- see the "Custom check" section.
const DOC_LINK = 'https://github.com/CanIL-CA/tabitha/issues/99'

export type NameCollisionFinding = {
	readonly app: string
	readonly label: string
	readonly page_file: string
	readonly chrome_file: string
}

// A voice-control tool (or a screen reader's "click <label>" command) can't disambiguate two
// simultaneously-on-screen controls that share an accessible name -- this is exactly the bug from
// PR #99, where the nav's "Check" link and the page's "Check" submit button had the same name.
// This check approximates the accessible-name algorithm using visible text only: it can miss or
// misjudge a case where `aria-label` overrides visible text, which a Playwright-rendered check
// would compute exactly, but at the cost of needing a browser per app. Static text is the accepted
// tradeoff -- see the backlog memory for the full discussion.

const INTERACTIVE_TAG_REGEXES = [
	/<a\b[^>]*>([\s\S]*?)<\/a>/gi,
	/<button\b[^>]*>([\s\S]*?)<\/button>/gi,
	/<div\b[^>]*\brole=["']button["'][^>]*>([\s\S]*?)<\/div>/gi,
	/<span\b[^>]*\brole=["']button["'][^>]*>([\s\S]*?)<\/span>/gi,
]

// Matches the `{ name: 'Home', href: '/' }`-shaped literals used to drive nav links from a data
// array (e.g. AppNav.svelte) instead of writing the label as literal markup text. Deliberately
// narrow to single-level (non-nested) object literals pairing a label key with an `href` key, in
// either order -- a general JS literal evaluator is out of scope for this check.
const DATA_LINK_LABEL_REGEXES = [
	/\{[^{}]*?\b(?:name|label|text)\s*:\s*['"]([^'"]+)['"][^{}]*?\bhref\b[^{}]*?\}/g,
	/\{[^{}]*?\bhref\b[^{}]*?\b(?:name|label|text)\s*:\s*['"]([^'"]+)['"][^{}]*?\}/g,
]

function strip_tags(text: string): string {
	return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function extract_labels_from_content(content: string): Set<string> {
	const labels = new Set<string>()

	for (const regex of INTERACTIVE_TAG_REGEXES) {
		const pattern = new RegExp(regex)
		let match: RegExpExecArray | null
		while ((match = pattern.exec(content)) !== null) {
			const label = strip_tags(match[1])
			if (label) labels.add(label)
		}
	}

	for (const regex of DATA_LINK_LABEL_REGEXES) {
		const pattern = new RegExp(regex)
		let match: RegExpExecArray | null
		while ((match = pattern.exec(content)) !== null) {
			const label = match[1].trim()
			if (label) labels.add(label)
		}
	}

	return labels
}

// Resolves a `$lib/...` or relative import specifier to a local `.svelte` file, or null if it
// isn't one (a `.ts` module, or a bare/package specifier like `@tabitha/ui`). Only local component
// files can hold labels this check needs to see -- shared-package components are out of scope, see
// the backlog memory.
function resolve_local_svelte_import(importer_path: string, specifier: string, app_src_dir: string): string | null {
	let resolved: string
	if (specifier.startsWith('$lib/')) {
		resolved = join(app_src_dir, 'lib', specifier.slice('$lib/'.length))
	} else if (specifier.startsWith('./') || specifier.startsWith('../')) {
		resolved = resolve(dirname(importer_path), specifier)
	} else {
		return null
	}

	if (!resolved.endsWith('.svelte')) resolved = `${resolved}.svelte`
	return existsSync(resolved) ? resolved : null
}

function extract_local_svelte_imports(content: string, file_path: string, app_src_dir: string): string[] {
	const script_match = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
	if (!script_match) return []

	const imports: string[] = []
	const import_regex = /from\s+['"]([^'"]+)['"]/g
	let match: RegExpExecArray | null
	while ((match = import_regex.exec(script_match[1])) !== null) {
		const resolved = resolve_local_svelte_import(file_path, match[1], app_src_dir)
		if (resolved) imports.push(resolved)
	}
	return imports
}

// Collects the label set for one `.svelte` file plus every local component it imports,
// recursively. `visited` prevents re-reading a shared component (or looping on a cycle).
async function collect_labels(file_path: string, app_src_dir: string, visited: Set<string>): Promise<Set<string>> {
	if (visited.has(file_path)) return new Set()
	visited.add(file_path)

	const labels = new Set<string>()
	let content: string
	try {
		content = await readFile(file_path, 'utf-8')
	} catch {
		return labels
	}

	for (const label of extract_labels_from_content(content)) labels.add(label)

	for (const imported_path of extract_local_svelte_imports(content, file_path, app_src_dir)) {
		const nested = await collect_labels(imported_path, app_src_dir, visited)
		for (const label of nested) labels.add(label)
	}

	return labels
}

async function find_files(dir: string, file_name: string): Promise<string[]> {
	if (!existsSync(dir)) return []
	const found: string[] = []
	const entries = await readdir(dir, { withFileTypes: true })
	for (const entry of entries) {
		const full_path = join(dir, entry.name)
		if (entry.isDirectory()) {
			found.push(...await find_files(full_path, file_name))
		} else if (entry.name === file_name) {
			found.push(full_path)
		}
	}
	return found
}

// SvelteKit composes every `+layout.svelte` from the routes root down to (and including) a page's
// own directory -- that whole chain is the "always-rendered chrome" a page's own labels must not
// collide with.
export function layout_chain_for_page(_routes_dir: string, page_path: string, all_layouts: string[]): string[] {
	const page_dir = dirname(page_path)
	return all_layouts.filter(layout_path => {
		const layout_dir = dirname(layout_path)
		return page_dir === layout_dir || page_dir.startsWith(`${layout_dir}/`)
	})
}

async function get_apps(): Promise<{ name: string; src_dir: string; routes_dir: string }[]> {
	const apps_dir = join(root_dir, 'apps')
	const entries = await readdir(apps_dir, { withFileTypes: true })
	const apps = []
	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		const src_dir = join(apps_dir, entry.name, 'src')
		const routes_dir = join(src_dir, 'routes')
		if (existsSync(routes_dir)) apps.push({ name: entry.name, src_dir, routes_dir })
	}
	return apps
}

export async function scan_accessible_name_collisions(): Promise<NameCollisionFinding[]> {
	const findings: NameCollisionFinding[] = []
	const apps = await get_apps()

	for (const app of apps) {
		const [pages, layouts] = await Promise.all([
			find_files(app.routes_dir, '+page.svelte'),
			find_files(app.routes_dir, '+layout.svelte'),
		])

		for (const page_path of pages) {
			const chrome_files = layout_chain_for_page(app.routes_dir, page_path, layouts)
			if (chrome_files.length === 0) continue

			const chrome_labels = new Map<string, string>()
			for (const chrome_file of chrome_files) {
				const labels = await collect_labels(chrome_file, app.src_dir, new Set())
				for (const label of labels) {
					if (!chrome_labels.has(label)) chrome_labels.set(label, chrome_file)
				}
			}

			const page_labels = await collect_labels(page_path, app.src_dir, new Set())
			for (const label of page_labels) {
				const chrome_file = chrome_labels.get(label)
				if (chrome_file) {
					findings.push({ app: app.name, label, page_file: page_path, chrome_file })
				}
			}
		}
	}

	return findings
}

async function audit_accessible_name_collisions() {
	console.log(`
============================================================
   🗣️  TaBiThA Accessible-Name Collision Audit
============================================================
`)

	const findings = await scan_accessible_name_collisions()
	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	if (findings.length === 0) {
		console.log('✨ No accessible-name collisions found between persistent nav/chrome and page content.\n')
		return
	}

	console.log(`⚠️  Found ${findings.length} accessible-name collision(s):\n`)

	for (const f of findings) {
		const rel_chrome = relative(root_dir, f.chrome_file)
		const rel_page = relative(root_dir, f.page_file)
		console.log(`[Accessible Name Collision: "${f.label}"] (${f.app})`)
		console.log(`  📄 Chrome:  ${rel_chrome}`)
		console.log(`  📄 Page:    ${rel_page}`)
		console.log(`  💡 A voice-control or screen-reader "click ${f.label}" command can't tell these two controls apart -- rename one.`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::warning file=${rel_page},title=Accessible Name Collision ("${f.label}")::This page's "${f.label}" control shares its accessible name with one in ${rel_chrome}, which is always rendered alongside it. (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${findings.length} non-blocking observation(s).\n`)

	const summary_file = process.env.GITHUB_STEP_SUMMARY
	if (is_ci && summary_file) {
		const { appendFile } = await import('node:fs/promises')
		let markdown = '## 🗣️ Accessible-Name Collision Audit\n\n'
		if (findings.length === 0) {
			markdown += '✨ **100% Clean!** No collisions between persistent nav/chrome and page content.\n\n'
		} else {
			markdown += '| App | Label | Chrome | Page |\n'
			markdown += '| :--- | :--- | :--- | :--- |\n'
			for (const f of findings) {
				markdown += `| ${f.app} | "${f.label}" | \`${relative(root_dir, f.chrome_file)}\` | \`${relative(root_dir, f.page_file)}\` |\n`
			}
			markdown += '\n'
		}
		await appendFile(summary_file, markdown, 'utf-8')
	}
}

if (import.meta.main) {
	await audit_accessible_name_collisions()
}
