import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { CoverageReport } from 'monocart-coverage-reports'
import type { CoverageJson } from './coverage_layers'
import { workspace_of, type CoverageSummaryJson } from './coverage_summary'
import { compile_untested, is_source_code } from './unit_coverage.config'

/** Where unit_coverage.config.ts leaves a workspace's unit coverage reports. */
export function unit_coverage_dir({ root_dir, workspace }: { root_dir: string, workspace: string }): string {
	return join(root_dir, workspace, 'coverage', 'unit')
}

/** Where the Playwright fixture in @tabitha/vite-config/playwright leaves an app's raw e2e coverage. */
export function e2e_raw_dir({ root_dir, workspace }: { root_dir: string, workspace: string }): string {
	return join(root_dir, workspace, 'coverage', 'e2e', 'raw')
}

/** Where `record_server_coverage` in @tabitha/vite-config leaves the coverage of an app's own dev server. */
export function e2e_server_dir({ root_dir, workspace }: { root_dir: string, workspace: string }): string {
	return join(root_dir, workspace, 'coverage', 'e2e-server')
}

/** The files the coverage report counts: a Vitest workspace's own source code. */
export function is_reported_source({ root_dir, workspaces, file }: { root_dir: string, workspaces: string[], file: string }): boolean {
	const workspace = workspace_of({ root_dir, file })
	return Boolean(workspace && workspaces.includes(workspace) && is_source_code(relative(join(root_dir, workspace), file)))
}

async function read_json<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf-8'))
}

/** monocart keys a report by path relative to the directory it ran in; this makes them absolute. */
function absolute_keys<T>({ base_dir, report }: { base_dir: string, report: Record<string, T> }): Record<string, T> {
	return Object.fromEntries(Object.entries(report).map(([file, value]) => [file === 'total' ? file : resolve(base_dir, file), value]))
}

/** Every workspace's unit coverage, as one summary and one istanbul report keyed by absolute path. */
export async function read_unit_coverage({ root_dir, workspaces }: { root_dir: string, workspaces: string[] }): Promise<{ summary: CoverageSummaryJson, files: CoverageJson }> {
	const summary: CoverageSummaryJson = {}
	const files: CoverageJson = {}
	for (const workspace of workspaces) {
		const dir = unit_coverage_dir({ root_dir, workspace })
		const base_dir = join(root_dir, workspace)
		if (existsSync(join(dir, 'coverage-summary.json'))) Object.assign(summary, absolute_keys({ base_dir, report: await read_json<CoverageSummaryJson>(join(dir, 'coverage-summary.json')) }))
		if (existsSync(join(dir, 'coverage-final.json'))) Object.assign(files, absolute_keys({ base_dir, report: await read_json<CoverageJson>(join(dir, 'coverage-final.json')) }))
	}
	delete summary.total
	return { summary, files }
}

async function read_server_coverage_files({ root_dir, workspaces }: { root_dir: string, workspaces: string[] }): Promise<string[]> {
	const files = await Promise.all(workspaces.map(async workspace => {
		const dir = e2e_server_dir({ root_dir, workspace })
		return existsSync(dir) ? (await readdir(dir)).filter(name => name.endsWith('.json')).map(name => join(dir, name)) : []
	}))
	return files.flat()
}

/**
 * The e2e layer: one istanbul report over every workspace's source from the apps' raw e2e coverage.
 * An app's e2e run can cover a package's code too, so this runs across all workspaces at once.
 * Files no e2e test loaded count as 0% covered, as in the unit layer.
 *
 * The browser's raw coverage can't see server code, so each app's dev server also records its own,
 * which is added to the same report.
 */
export async function generate_e2e_coverage({ root_dir, workspaces, output_dir }: { root_dir: string, workspaces: string[], output_dir: string }): Promise<CoverageJson> {
	const input_dirs = workspaces.map(workspace => e2e_raw_dir({ root_dir, workspace })).filter(dir => existsSync(dir))
	const server_files = await read_server_coverage_files({ root_dir, workspaces })
	if (input_dirs.length === 0 && server_files.length === 0) return {}

	const keep = (path: string) => is_reported_source({ root_dir, workspaces, file: resolve(root_dir, path) })
	const report = new CoverageReport({
		name: 'e2e',
		outputDir: output_dir,
		inputDir: input_dirs.length > 0 ? input_dirs : undefined,
		baseDir: root_dir,
		reports: ['json'],
		logging: 'error',
		all: {
			dir: workspaces.map(workspace => join(root_dir, workspace, 'src')),
			filter: (path: string) => keep(path) && 'js',
			transformer: compile_untested,
		},
		sourceFilter: keep,
	})
	for (const file of server_files) await report.add(await read_json(file))
	await report.generate()
	return absolute_keys({ base_dir: root_dir, report: await read_json<CoverageJson>(join(output_dir, 'coverage-final.json')) })
}
