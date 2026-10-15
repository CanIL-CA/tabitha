import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CopilotNote, CopilotResult } from '@tabitha/types'
import type { EvalCase } from './cases'
import type { RecordedResponse } from './cassette'
import type { CaseComparison, UsageTotals } from './checks'
import type { EvalCall } from './eval_client'
import type { Variant } from './variants'

declare module 'vitest' {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- module augmentation needs an interface
	export interface ProvidedContext {
		variant: string
		baseline: string
		force: boolean
	}
}

// Gitignored: the captured inputs hold third-party text (Aquifer notes).
export const DATA_DIR = fileURLToPath(new URL('./.data/', import.meta.url))

export type CapturedInputs = {
	case: EvalCase
	captured_at: string
	recorded: RecordedResponse[]
}

export type CaseRun = {
	case_id: string
	variant: string
	ran_at: string
	duration_ms: number
	result: CopilotResult
	calls: EvalCall[]
}

// What a reviewer sees of one note: the trigger's flags are pipeline detail, and large.
export type ReviewNote = Omit<CopilotNote, 'trigger'> & { trigger: string }
export type ReviewResult = Exclude<CopilotResult, { notes: unknown } | { semantic_notes: unknown }> | ReviewDiscern | ReviewBrief
type ReviewDiscern = Omit<Extract<CopilotResult, { type: 'discern' }>, 'notes'> & { notes: ReviewNote[] }
type ReviewBrief = Omit<Extract<CopilotResult, { type: 'brief' }>, 'semantic_notes'> & { semantic_notes: ReviewNote[] }

export type ReportCase = {
	id: string
	reference: string
	lwc: string
	mode: string
	mtt_level: string
	note: string
	english_text: string
	baseline: ReviewResult
	variant: ReviewResult
	checks: CaseComparison
}

export type Report = {
	generated_at: string
	baseline: Variant
	variant: Variant
	summary: {
		cases: number
		missing: string[]
		// Both outputs empty (no triggers fired and no Aquifer notes), so there is nothing to review.
		no_output: string[]
		usage: { baseline: UsageTotals, variant: UsageTotals }
		cases_with_warnings: number
		median_word_overlap: number
	}
	cases: ReportCase[]
}

export const inputs_path = (case_id: string) => join(DATA_DIR, 'inputs', `${case_id}.json`)
export const run_path = ({ variant, case_id }: { variant: string, case_id: string }) => join(DATA_DIR, 'runs', variant, `${case_id}.json`)
export const report_path = ({ baseline, variant }: { baseline: string, variant: string }) => join(DATA_DIR, 'reports', `${baseline}-vs-${variant}.json`)
export const survey_path = ({ baseline, variant }: { baseline: string, variant: string }) => join(DATA_DIR, 'surveys', `${baseline}-vs-${variant}.json`)

export function read_json<T>(path: string): T | null {
	return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as T : null
}

export function write_json({ path, value }: { path: string, value: unknown }): void {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(value, null, '\t')}\n`, 'utf-8')
}
