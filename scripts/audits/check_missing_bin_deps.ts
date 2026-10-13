import { $ } from 'bun'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

export type MissingBinDepFinding = {
	readonly package_name: string
	readonly file_path: string
	readonly line_number: number
	readonly command: string
	readonly expected_package: string
	readonly message: string
}

// Where this check's rationale and remediation steps are documented.
const DOC_LINK = 'README.md#verification--testing'

// Shell commands this repo invokes (via Bun's `$` tagged template or Node's child_process) that
// come from an npm package rather than the OS -- and the package that must be a direct
// dependency of any workspace package that shells out to them. A tool invoked this way only
// works in CI if the package providing its binary is actually installed where the script runs
// (see 1191e036: wrangler was declared in every app except tools/databases, so the nightly R2
// backup job could never find it on PATH even after `bun install` ran).
const KNOWN_BIN_PACKAGES: Record<string, string> = {
	wrangler: 'wrangler',
	tsc: 'typescript',
	eslint: 'eslint',
	vite: 'vite',
	vitest: 'vitest',
	playwright: '@playwright/test',
	prettier: 'prettier',
	turbo: 'turbo',
	'markdownlint-cli2': 'markdownlint-cli2',
}

// Each pattern's capture group is the invoked command name. Covers Bun's `$` tagged template
// (the idiom tools/databases and scripts/{audits,ci,dx} actually use) and Node's child_process
// escape hatches (e.g. scripts/dx/dev_menu.ts's `spawn('turbo', ...)`) -- both are just strings
// to the type checker and bundler, so neither is caught by `bun run check` or `bun run build`.
const SHELL_COMMAND_PATTERNS: RegExp[] = [
	/\$`\s*([a-zA-Z0-9_.-]+)/g,
	/\b(?:execSync|exec)\(\s*[`'"]([a-zA-Z0-9_.-]+)/g,
	/\b(?:spawn|spawnSync)\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g,
]

export type WorkspacePackage = {
	readonly name: string
	readonly dir: string
	readonly package_json_path: string
}

const WORKSPACE_GLOBS = ['apps', 'packages', 'tools']

export async function get_workspace_packages(): Promise<WorkspacePackage[]> {
	const packages: WorkspacePackage[] = []
	for (const group of WORKSPACE_GLOBS) {
		const group_dir = join(root_dir, group)
		if (!existsSync(group_dir)) continue
		const entries = await readdir(group_dir, { withFileTypes: true })
		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			const dir = join(group_dir, entry.name)
			const package_json_path = join(dir, 'package.json')
			if (existsSync(package_json_path)) {
				packages.push({ name: `${group}/${entry.name}`, dir, package_json_path })
			}
		}
	}

	// scripts/ sits outside the apps/packages/tools globs above, so it needs its own synthetic entry.
	const scripts_dir = join(root_dir, 'scripts')
	if (existsSync(scripts_dir)) {
		packages.push({ name: 'scripts', dir: scripts_dir, package_json_path: join(scripts_dir, 'package.json') })
	}

	return packages
}

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
				entry.name === '.git'
			) {
				continue
			}
			files.push(...await get_scannable_source_files(full_path))
		} else if (
			(entry.name.endsWith('.ts') || entry.name.endsWith('.js')) &&
			!entry.name.endsWith('.d.ts') &&
			!entry.name.endsWith('.test.ts') &&
			!entry.name.endsWith('.spec.ts')
		) {
			files.push(full_path)
		}
	}
	return files
}

async function get_declared_dependency_names(package_json_path: string): Promise<Set<string>> {
	const content = await readFile(package_json_path, 'utf-8')
	const parsed = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
	return new Set([
		...Object.keys(parsed.dependencies ?? {}),
		...Object.keys(parsed.devDependencies ?? {}),
	])
}

export type ShellCommandUsage = {
	readonly line_number: number
	readonly command: string
}

// Pure line-scanner: finds commands invoked via Bun's `$` tagged template or Node's
// child_process helpers, e.g. `$`wrangler ...`` or `spawn('turbo', args)`.
export function extract_shell_commands(content: string): ShellCommandUsage[] {
	const usages: ShellCommandUsage[] = []
	content.split('\n').forEach((line, idx) => {
		const trimmed = line.trim()
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

		for (const pattern of SHELL_COMMAND_PATTERNS) {
			for (const match of line.matchAll(pattern)) {
				usages.push({ line_number: idx + 1, command: match[1] })
			}
		}
	})
	return usages
}

export function find_undeclared_bin_deps({ pkg, file_path, content, declared }: {
	pkg: { name: string }
	file_path: string
	content: string
	declared: ReadonlySet<string>
}): MissingBinDepFinding[] {
	const findings: MissingBinDepFinding[] = []
	for (const usage of extract_shell_commands(content)) {
		const expected_package = KNOWN_BIN_PACKAGES[usage.command]
		if (!expected_package) continue
		if (declared.has(expected_package)) continue

		findings.push({
			package_name: pkg.name,
			file_path,
			line_number: usage.line_number,
			command: usage.command,
			expected_package,
			message: `"${usage.command}" is invoked via shell but "${expected_package}" is not a direct dependency of ${pkg.name}. It may work locally (globally installed, or hoisted from another package) and still fail in CI.`,
		})
	}
	return findings
}

export async function analyze_package_bin_deps(pkg: WorkspacePackage): Promise<MissingBinDepFinding[]> {
	const declared = await get_declared_dependency_names(pkg.package_json_path)
	const files = await get_scannable_source_files(pkg.dir)

	const findings = (await Promise.all(files.map(async file_path => {
		const content = await readFile(file_path, 'utf-8')
		return find_undeclared_bin_deps({ pkg, file_path, content, declared })
	}))).flat()

	return findings
}

// Maps changed files (relative to repo root) to the workspace packages containing them, so a
// diff-scoped run only checks packages a change actually touched -- never nags about unrelated
// packages a developer isn't working on.
export async function get_changed_workspace_packages(base_ref: string): Promise<WorkspacePackage[]> {
	const all_packages = await get_workspace_packages()
	const changed_files = (await $`git diff --name-only ${base_ref}...HEAD`.text()).trim().split('\n').filter(Boolean)

	const changed_dirs = new Set<string>()
	for (const file of changed_files) {
		const match = all_packages.find(pkg => file.startsWith(`${relative(root_dir, pkg.dir)}/`))
		if (match) changed_dirs.add(match.dir)
	}

	return all_packages.filter(pkg => changed_dirs.has(pkg.dir))
}

export async function resolve_diff_base(): Promise<string | undefined> {
	if (process.env.GITHUB_BASE_REF) {
		try {
			await $`git rev-parse origin/${process.env.GITHUB_BASE_REF}`.quiet()
			return `origin/${process.env.GITHUB_BASE_REF}`
		} catch {
			// A PR can target any branch (ci.yml's `pull_request: branches: ['**']`), so silently
			// falling through to the `main`-merge-base tier below risks diffing against the wrong
			// branch with no trace of it happening. Warn -- callers that gate whole CI jobs on
			// this (scripts/ci/plan.ts) need that visible, even though `main` is still the best
			// available guess and the fallback chain still ends in a fail-safe full run.
			console.warn(`⚠️  Could not resolve origin/${process.env.GITHUB_BASE_REF} (this PR's declared base) -- falling back to a same-branch comparison against main instead.`)
		}
	}
	// Merge-base with origin/main, not just the previous commit -- a multi-commit local branch's
	// full diff vs main matters here, not only its most recent commit. Deliberately origin/main,
	// not local main: a dev who rebases onto origin/main directly (the common move) never
	// advances their local main branch, so comparing against the local ref could compute a stale
	// merge-base. Worst case that's over-scoping (extra already-merged files inflate the diff,
	// never fewer), but origin/main -- refreshed by any `git fetch` -- avoids it in practice.
	try {
		await $`git rev-parse --verify origin/main`.quiet()
		const merge_base = (await $`git merge-base HEAD origin/main`.text()).trim()
		if (merge_base) return merge_base
	} catch {
		// fall through
	}
	try {
		await $`git rev-parse HEAD^`.quiet()
		return 'HEAD^'
	} catch {
		return undefined
	}
}

export async function scan_missing_bin_deps(options: { all?: boolean } = {}): Promise<{ scanned: WorkspacePackage[]; findings: MissingBinDepFinding[]; scoped: boolean }> {
	let packages_to_scan: WorkspacePackage[]
	let scoped = false

	if (options.all) {
		packages_to_scan = await get_workspace_packages()
	} else {
		const base_ref = await resolve_diff_base()
		if (!base_ref) {
			packages_to_scan = await get_workspace_packages()
		} else {
			packages_to_scan = await get_changed_workspace_packages(base_ref)
			scoped = true
		}
	}

	const all_findings = (await Promise.all(packages_to_scan.map(analyze_package_bin_deps))).flat()

	return { scanned: packages_to_scan, findings: all_findings, scoped }
}

async function audit_missing_bin_deps() {
	console.log(`
============================================================
    🔧 TaBiThA Undeclared CLI Dependency Audit
============================================================
`)

	const force_all = process.argv.includes('--all')
	const result = await scan_missing_bin_deps({ all: force_all })

	const scope_desc = result.scoped
		? `${result.scanned.length} workspace package(s) touched by this change`
		: `all ${result.scanned.length} workspace package(s)`
	console.log(`🔍 Scanning ${scope_desc} for shell-invoked commands missing from their own package.json...\n`)

	if (result.findings.length === 0) {
		console.log('✅ 100% Clean! Every shelled-out CLI command is a direct dependency of the package that invokes it.\n')
		return true
	}

	console.log(`❌ Detected ${result.findings.length} undeclared CLI dependenc(y/ies):\n`)

	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	for (const f of result.findings) {
		const rel_path = relative(root_dir, f.file_path)
		console.log(`[Missing Bin Dependency: ${f.command}]`)
		console.log(`  📄 ${rel_path}:${f.line_number}`)
		console.log(`  💡 ${f.message}`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::error file=${rel_path},line=${f.line_number},title=Missing Bin Dependency (${f.command})::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${result.findings.length} finding(s) across ${result.scanned.length} scanned package(s).\n`)
	return false
}

if (import.meta.main) {
	const passed = await audit_missing_bin_deps()
	if (!passed) {
		process.exit(1)
	}
}
