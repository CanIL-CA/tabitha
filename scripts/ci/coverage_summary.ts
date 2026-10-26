import { relative, sep } from 'node:path'

export const METRICS = ['lines', 'statements', 'branches', 'functions'] as const
export type Metric = typeof METRICS[number]

export type Counts = { total: number, covered: number }
export type FileSummary = Record<Metric, Counts>

/** Vitest's `json-summary` reporter: one entry per file (absolute path) plus `total`. */
export type CoverageSummaryJson = Record<string, FileSummary>

export type WorkspaceManifest = { dir: string, scripts?: Record<string, string> }

/** The workspaces whose unit tests run under Vitest; `tools/` and `scripts/` use `bun test` instead. */
export function vitest_workspaces(manifests: WorkspaceManifest[]): string[] {
	return manifests
		.filter(manifest => manifest.scripts?.['test:unit']?.startsWith('vitest'))
		.map(manifest => manifest.dir)
		.sort()
}

/** `apps/editor/src/x.ts` -> `apps/editor`; null for anything outside apps/ or packages/. */
export function workspace_of({ root_dir, file }: { root_dir: string, file: string }): string | null {
	const [area, name] = relative(root_dir, file).split(sep)
	if (area !== 'apps' && area !== 'packages' || !name) return null
	return `${area}/${name}`
}

/** Percentage covered, or null when there is nothing to cover (a metric with no total). */
export function percent(counts: Counts): number | null {
	return counts.total === 0 ? null : counts.covered / counts.total * 100
}
