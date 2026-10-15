import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, inject, test } from 'vitest'
import { fetch_target_text } from '#lib/fetches.js'
import { default_target_audience } from '#lib/lookups.js'
import { EVAL_CASES, type EvalCase } from './cases'
import { create_replay_fetch } from './cassette'
import { compare_case, usage_totals, type UsageTotals } from './checks'
import { DATA_DIR, read_json, report_path, run_path, write_json, type CapturedInputs, type CaseRun, type Report, type ReportCase, type ReviewNote, type ReviewResult } from './data'
import { find_variant } from './variants'
import type { EvalCall } from './eval_client'
import type { CopilotNote, CopilotResult } from '@tabitha/types'


const baseline = find_variant(inject('baseline'))
const variant = find_variant(inject('variant'))

const real_fetch = globalThis.fetch

beforeAll(() => {
	const recorded = readdirSync(join(DATA_DIR, 'inputs'))
		.flatMap(file => read_json<CapturedInputs>(join(DATA_DIR, 'inputs', file))?.recorded ?? [])
	globalThis.fetch = create_replay_fetch({ real_fetch, recorded, live_origins: [] })
})

afterAll(() => {
	globalThis.fetch = real_fetch
})

test('report', async () => {
	const cases: ReportCase[] = []
	const missing: string[] = []
	const no_output: string[] = []
	const baseline_calls: EvalCall[] = []
	const variant_calls: EvalCall[] = []

	for (const eval_case of EVAL_CASES) {
		const baseline_run = read_json<CaseRun>(run_path({ variant: baseline.name, case_id: eval_case.id }))
		const variant_run = read_json<CaseRun>(run_path({ variant: variant.name, case_id: eval_case.id }))
		if (!baseline_run || !variant_run) {
			missing.push(eval_case.id)
			continue
		}
		baseline_calls.push(...baseline_run.calls)
		variant_calls.push(...variant_run.calls)
		const report_case = await to_report_case({ eval_case, baseline_run, variant_run })
		if (is_empty(report_case)) no_output.push(eval_case.id)
		else cases.push(report_case)
	}

	const overlaps = cases.map(({ checks }) => checks.word_overlap).toSorted((a, b) => a - b)
	const report: Report = {
		generated_at: new Date().toISOString(),
		baseline,
		variant,
		summary: {
			cases: cases.length,
			missing,
			no_output,
			usage: { baseline: usage_totals(baseline_calls), variant: usage_totals(variant_calls) },
			cases_with_warnings: cases.filter(({ checks }) => checks.warnings.length).length,
			median_word_overlap: overlaps[Math.floor(overlaps.length / 2)] ?? 0,
		},
		cases,
	}

	const path = report_path({ baseline: baseline.name, variant: variant.name })
	write_json({ path, value: report })
	print_summary({ report, path })
})

async function to_report_case({ eval_case, baseline_run, variant_run }: { eval_case: EvalCase, baseline_run: CaseRun, variant_run: CaseRun }): Promise<ReportCase> {
	const { reference, settings } = eval_case
	const english = await fetch_target_text({ reference, project: 'English', preferred_audience: default_target_audience['English'] })

	return {
		id: eval_case.id,
		reference: `${reference.book} ${reference.chapter}:${reference.verse}`,
		lwc: settings.lwc,
		mode: settings.mode,
		mtt_level: settings.mtt_level,
		note: eval_case.note,
		english_text: english ? english.ideal || english.text : '',
		baseline: to_review_result(baseline_run.result),
		variant: to_review_result(variant_run.result),
		checks: compare_case({ baseline: baseline_run, variant: variant_run }),
	}
}

function is_empty({ baseline, variant, checks }: ReportCase): boolean {
	const total = (counts: Record<string, number>) => Object.values(counts).reduce((sum, count) => sum + count, 0)
	return baseline.type !== 'error' && variant.type !== 'error' && !total(checks.counts.baseline) && !total(checks.counts.variant)
}

function to_review_result(result: CopilotResult): ReviewResult {
	if (result.type === 'discern') return { ...result, notes: result.notes.map(to_review_note) }
	if (result.type === 'brief') return { ...result, semantic_notes: result.semantic_notes.map(to_review_note) }
	return result
}

function to_review_note({ trigger, ...note }: CopilotNote): ReviewNote {
	return { ...note, trigger: trigger?.name ?? 'unmatched' }
}

function print_summary({ report, path }: { report: Report, path: string }): void {
	const { usage, cases, missing, no_output, cases_with_warnings, median_word_overlap } = report.summary
	const change = (pick: (totals: UsageTotals) => number) => {
		const before = pick(usage.baseline)
		const after = pick(usage.variant)
		return `${before} → ${after} (${before ? `${Math.round((after - before) / before * 100)}%` : 'n/a'})`
	}
	process.stderr.write([
		'',
		`${report.baseline.name} vs ${report.variant.name}: ${cases} cases${missing.length ? `, ${missing.length} missing (${missing.join(', ')})` : ''}`,
		...no_output.length ? [`  no output to review  ${no_output.join(', ')}`] : [],
		`  prompt tokens         ${change(totals => totals.prompt_tokens)}`,
		`  billed output tokens  ${change(totals => totals.billed_output_tokens)}`,
		`  thought tokens        ${change(totals => totals.thought_tokens)}`,
		`  model time (ms)       ${change(totals => totals.duration_ms)}`,
		`  cases with warnings   ${cases_with_warnings}`,
		`  median word overlap   ${median_word_overlap.toFixed(2)}`,
		`  report                ${path}`,
		'',
	].join('\n'))
}
