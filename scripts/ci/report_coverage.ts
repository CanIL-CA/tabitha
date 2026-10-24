import { $, Glob } from 'bun'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vitest_workspaces, type WorkspaceManifest } from './coverage_summary'
import { unit_coverage_dir } from './monocart_report'

export const root_dir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const coverage_dir = join(root_dir, 'coverage')
const unit_config_path = join(root_dir, 'scripts/ci/unit_coverage.config.ts')

async function read_json<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf-8'))
}

export async function read_manifests(): Promise<WorkspaceManifest[]> {
	const manifests: WorkspaceManifest[] = []
	for (const path of new Glob('{apps,packages}/*/package.json').scanSync({ cwd: root_dir })) {
		const { scripts } = await read_json<{ scripts?: Record<string, string> }>(join(root_dir, path))
		manifests.push({ dir: path.replace(/\/package\.json$/, ''), scripts })
	}
	return manifests
}

async function run_coverage_report() {
	await rm(coverage_dir, { recursive: true, force: true })
	await mkdir(coverage_dir, { recursive: true })

	// SvelteKit's Vite plugin resolves the app from the working directory, so each workspace runs
	// in its own directory and writes its own report (unit_coverage.config.ts). Every workspace
	// covers only its own src/. The per-workspace coverage-final.json files are what CI
	// packs for merge_coverage.ts, which builds the report. monocart, not Vitest's v8 reporter,
	// counts the lines, so they share a denominator with its e2e layer.
	const workspaces = vitest_workspaces(await read_manifests())
	let failed = false
	for (const dir of workspaces) {
		await rm(unit_coverage_dir({ root_dir, workspace: dir }), { recursive: true, force: true })
		console.log(`🧪 ${dir}`)
		const run = await $`bunx vitest run src --passWithNoTests --coverage --coverage.provider=custom --coverage.customProviderModule=vitest-monocart-coverage --coverage.coverageReportOptions=${unit_config_path} --coverage.reportsDirectory=${unit_coverage_dir({ root_dir, workspace: dir })} --reporter=dot`
			.cwd(join(root_dir, dir))
			.nothrow()
		if (run.exitCode !== 0) {
			failed = true
			console.error(`❌ ${dir}: unit tests failed`)
		}
	}

	if (failed) {
		console.error('❌ Unit tests failed.')
		process.exit(1)
	}
}

if (import.meta.main) {
	await run_coverage_report()
}
