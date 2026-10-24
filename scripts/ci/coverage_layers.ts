import { percent, workspace_of, type Counts } from './coverage_summary'

/** One file of an istanbul `coverage-final.json`, reduced to what line coverage needs. */
export type FileCoverage = {
	statementMap: Record<string, { start: { line: number } }>
	s: Record<string, number>
}

/** An istanbul `coverage-final.json`, keyed by absolute path. */
export type CoverageJson = Record<string, FileCoverage>

/** Lines in total, and lines covered by unit tests, e2e tests, either (union) or both (intersection). */
export type LineLayers = { total: number, unit: number, e2e: number, union: number, both: number }

export type WorkspaceLayers = { workspace: string } & LineLayers

/** Istanbul's own line rule: a line is a statement's start line, covered when any statement there ran. */
function line_hits(file?: FileCoverage): Map<number, boolean> {
	const hits = new Map<number, boolean>()
	for (const [id, { start }] of Object.entries(file?.statementMap ?? {})) {
		hits.set(start.line, hits.get(start.line) || (file?.s[id] ?? 0) > 0)
	}
	return hits
}

export function file_layers({ unit, e2e }: { unit?: FileCoverage, e2e?: FileCoverage }): LineLayers {
	const unit_hits = line_hits(unit)
	const e2e_hits = line_hits(e2e)
	const layers = { total: 0, unit: 0, e2e: 0, union: 0, both: 0 }
	for (const line of new Set([...unit_hits.keys(), ...e2e_hits.keys()])) {
		const by_unit = unit_hits.get(line) ?? false
		const by_e2e = e2e_hits.get(line) ?? false
		layers.total++
		if (by_unit) layers.unit++
		if (by_e2e) layers.e2e++
		if (by_unit || by_e2e) layers.union++
		if (by_unit && by_e2e) layers.both++
	}
	return layers
}

export function layers_by_workspace({ root_dir, unit, e2e }: { root_dir: string, unit: CoverageJson, e2e: CoverageJson }): WorkspaceLayers[] {
	const by_workspace = new Map<string, WorkspaceLayers>()
	for (const file of new Set([...Object.keys(unit), ...Object.keys(e2e)])) {
		const workspace = workspace_of({ root_dir, file })
		if (!workspace) continue
		const entry = by_workspace.get(workspace) ?? { workspace, total: 0, unit: 0, e2e: 0, union: 0, both: 0 }
		const layers = file_layers({ unit: unit[file], e2e: e2e[file] })
		for (const key of ['total', 'unit', 'e2e', 'union', 'both'] as const) entry[key] += layers[key]
		by_workspace.set(workspace, entry)
	}
	return [...by_workspace.values()].sort((a, b) => a.workspace.localeCompare(b.workspace))
}

function format_share({ covered, total }: Counts): string {
	const value = percent({ covered, total })
	return value === null ? 'n/a' : `${value.toFixed(1)}%`
}

/** Change in union coverage against the baseline, in percentage points, or '' with no baseline for it. */
export function format_delta({ current, baseline }: { current: Counts, baseline?: Counts }): string {
	if (!baseline) return ''
	const now = percent(current)
	const before = percent(baseline)
	if (now === null || before === null) return ''
	const points = now - before
	if (Math.abs(points) < 0.05) return '±0.0'
	return `${points > 0 ? '▲' : '▼'} ${Math.abs(points).toFixed(1)}`
}

export function layers_markdown({ layers, baseline, baseline_label }: {
	layers: WorkspaceLayers[]
	baseline?: WorkspaceLayers[]
	baseline_label?: string
}): string {
	const baseline_by_workspace = new Map(baseline?.map(entry => [entry.workspace, entry]))
	const rows = layers.map(({ workspace, total, unit, e2e, union, both }) => {
		const before = baseline_by_workspace.get(workspace)
		const delta = format_delta({ current: { covered: union, total }, baseline: before && { covered: before.union, total: before.total } })
		const cells = [`\`${workspace}\``, format_share({ covered: union, total }), ...baseline ? [delta] : [], ...[unit, e2e, both].map(covered => format_share({ covered, total }))]
		return `| ${cells.join(' | ')} |`
	})
	const headers = ['Workspace', 'Union', ...baseline ? ['Δ union'] : [], 'Unit', 'E2E', 'Both']
	return [
		'### 🧩 Unit + E2E line coverage',
		'',
		'**Union** is lines run by unit tests, e2e tests or both: what neither covers is the real gap. **Both** is lines run by each.',
		baseline ? `Δ is percentage points against ${baseline_label ?? 'the main baseline'}.` : 'No main baseline was available, so there is no Δ column.',
		'',
		`| ${headers.join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows,
		'',
		'E2E counts browser code only (Chromium); server code that e2e reaches, such as `+server.ts` routes, shows as unit coverage or none.',
		'',
	].join('\n')
}
