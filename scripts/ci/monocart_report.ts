import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
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

/**
 * The e2e layer: one istanbul report over every workspace's source from the apps' raw e2e coverage.
 * An app's e2e run can cover a package's code too, so this runs across all workspaces at once.
 * Files no e2e test loaded count as 0% covered, as in the unit layer.
 */
export async function generate_e2e_coverage({ root_dir, workspaces, output_dir }: { root_dir: string, workspaces: string[], output_dir: string }): Promise<CoverageJson> {
	const input_dirs = workspaces.map(workspace => e2e_raw_dir({ root_dir, workspace })).filter(dir => existsSync(dir))
	if (input_dirs.length === 0) return {}

	const keep = (path: string) => is_reported_source({ root_dir, workspaces, file: resolve(root_dir, path) })
	await new CoverageReport({
		name: 'e2e',
		outputDir: output_dir,
		inputDir: input_dirs,
		baseDir: root_dir,
		reports: ['json'],
		logging: 'error',
		all: {
			dir: workspaces.map(workspace => join(root_dir, workspace, 'src')),
			filter: (path: string) => keep(path) && 'js',
			transformer: compile_untested,
		},
		sourceFilter: keep,
	}).generate()
	return absolute_keys({ base_dir: root_dir, report: await read_json<CoverageJson>(join(output_dir, 'coverage-final.json')) })
}
