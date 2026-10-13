import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get_workspace_packages, type WorkspacePackage } from './check_missing_bin_deps'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

// Where this check's rationale and remediation steps are documented.
const DOC_LINK = 'AGENTS.md#cross-package-relative-imports'

const PARENT_RELATIVE_IMPORT_PATTERN = /from\s+['"](\.\.\/[^'"]+)['"]/g
const SCAN_EXTENSIONS = ['.ts', '.svelte', '.js']
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'dist', '.wrangler', '.turbo', '.git'])

export type RelativePackageImportFinding = {
	readonly file_path: string
	readonly line_number: number
	readonly specifier: string
	readonly importing_package: string
	readonly target_package: string
	readonly message: string
}

async function get_scannable_files(dir: string): Promise<string[]> {
	if (!existsSync(dir)) return []
	const files: string[] = []
	const entries = await readdir(dir, { withFileTypes: true })
	for (const entry of entries) {
		const full_path = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue
			files.push(...await get_scannable_files(full_path))
		} else if (SCAN_EXTENSIONS.some(ext => entry.name.endsWith(ext)) &&
				!entry.name.endsWith('.d.ts') &&
				!entry.name.endsWith('.test.ts') &&
				!entry.name.endsWith('.spec.ts')) {
			files.push(full_path)
		}
	}
	return files
}

// A resolved specifier belongs to a package if it lands inside that package's directory --
// prefixed with a path separator so e.g. "apps/targets" doesn't false-match "apps/targets-old".
function find_containing_package({ path, packages }: {
	path: string
	packages: WorkspacePackage[]
}): WorkspacePackage | undefined {
	return packages.find(pkg => path === pkg.dir || path.startsWith(`${pkg.dir}${sep}`))
}

async function read_package_name(package_json_path: string): Promise<string> {
	const content = await readFile(package_json_path, 'utf-8')
	const parsed = JSON.parse(content) as { name?: string }
	return parsed.name ?? relative(root_dir, dirname(package_json_path))
}

// Only imports that climb at least one directory (`../`) can possibly resolve outside the
// importing file's own package -- a same-directory `./sibling` import never needs checking, and
// deliberately isn't flagged by this rule even when it could in principle be rewritten as a
// package-qualified import (see AGENTS.md's "Cross-package relative imports" for why).
export function scan_file_for_boundary_violations({ file_path, content, importing_pkg, importing_pkg_name, all_packages, package_names }: {
	file_path: string
	content: string
	importing_pkg: WorkspacePackage
	importing_pkg_name: string
	all_packages: WorkspacePackage[]
	package_names: ReadonlyMap<string, string>
}): RelativePackageImportFinding[] {
	const findings: RelativePackageImportFinding[] = []
	const dir = dirname(file_path)
	const regex = new RegExp(PARENT_RELATIVE_IMPORT_PATTERN)
	let match: RegExpExecArray | null

	while ((match = regex.exec(content)) !== null) {
		const specifier = match[1]
		const resolved = resolve(dir, specifier)
		const target_pkg = find_containing_package({ path: resolved, packages: all_packages })
		if (!target_pkg || target_pkg.dir === importing_pkg.dir) continue

		const line_number = content.substring(0, match.index).split('\n').length
		const target_name = package_names.get(target_pkg.dir) ?? target_pkg.name

		findings.push({
			file_path,
			line_number,
			specifier,
			importing_package: importing_pkg_name,
			target_package: target_name,
			message: `Imports "${specifier}", reaching directly into ${target_name}'s internal files via a relative path instead of importing it as a package. Import from "${target_name}" (adding it as a real dependency if it isn't one yet) instead of relying on its current file layout.`,
		})
	}

	return findings
}

async function analyze_package({ pkg, all_packages, package_names }: {
	pkg: WorkspacePackage
	all_packages: WorkspacePackage[]
	package_names: ReadonlyMap<string, string>
}): Promise<RelativePackageImportFinding[]> {
	const importing_pkg_name = package_names.get(pkg.dir) ?? pkg.name
	const files = await get_scannable_files(pkg.dir)

	const findings = (await Promise.all(files.map(async file_path => {
		const content = await readFile(file_path, 'utf-8')
		return scan_file_for_boundary_violations({ file_path, content, importing_pkg: pkg, importing_pkg_name, all_packages, package_names })
	}))).flat()

	return findings
}

export async function scan_relative_package_imports(): Promise<{ scanned: WorkspacePackage[]; findings: RelativePackageImportFinding[] }> {
	const packages = await get_workspace_packages()
	const package_names = new Map(await Promise.all(packages.map(async pkg => [pkg.dir, await read_package_name(pkg.package_json_path)] as const)))

	const all_findings = (await Promise.all(packages.map(pkg => analyze_package({ pkg, all_packages: packages, package_names })))).flat()

	return { scanned: packages, findings: all_findings }
}

async function audit_relative_package_imports() {
	console.log(`
============================================================
    📦 TaBiThA Cross-Package Relative Import Audit
============================================================
`)

	const result = await scan_relative_package_imports()

	console.log(`🔍 Scanning ${result.scanned.length} workspace package(s) for relative imports that reach into another package...\n`)

	if (result.findings.length === 0) {
		console.log('✅ 100% Clean! No relative import reaches across a package boundary.\n')
		return true
	}

	console.log(`❌ Detected ${result.findings.length} cross-package relative import(s):\n`)

	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	for (const f of result.findings) {
		const rel_path = relative(root_dir, f.file_path)
		console.log(`[Cross-Package Relative Import: ${f.importing_package} -> ${f.target_package}]`)
		console.log(`  📄 ${rel_path}:${f.line_number}`)
		console.log(`  💡 ${f.message}`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::error file=${rel_path},line=${f.line_number},title=Cross-Package Relative Import (${f.importing_package} -> ${f.target_package})::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${result.findings.length} finding(s) across ${result.scanned.length} scanned package(s).\n`)
	return false
}

if (import.meta.main) {
	const passed = await audit_relative_package_imports()
	if (!passed) {
		process.exit(1)
	}
}
