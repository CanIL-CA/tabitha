import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, inject, test } from 'vitest'
import { AI_GATEWAY_TOKEN, CLOUDFLARE_ACCOUNT_ID, GEMINI_LOCATION, GEMINI_PROJECT_ID } from '$app/env/private'
import { get_verse_result } from '#lib/server/verse_result.js'
import { translate_json } from '#lib/server/brief/brief.js'
import { EVAL_CASES, type EvalCase } from './cases'
import { create_replay_fetch } from './cassette'
import { DATA_DIR, inputs_path, read_json, run_path, write_json, type CapturedInputs, type CaseRun } from './data'
import { create_eval_ai_client } from './eval_client'
import { find_variant } from './variants'
import type { AiClient } from '@tabitha/ai'
import type { CopilotResult } from '@tabitha/types'


const GATEWAY_ORIGIN = 'https://gateway.ai.cloudflare.com'

const variant = find_variant(inject('variant'))
const force = inject('force')
const gateway = { account_id: CLOUDFLARE_ACCOUNT_ID, token: AI_GATEWAY_TOKEN, project: GEMINI_PROJECT_ID, location: GEMINI_LOCATION }

const real_fetch = globalThis.fetch

beforeAll(() => {
	// Cases share responses (the same verse in two modes), so replay serves from all captures.
	const recorded = readdirSync(join(DATA_DIR, 'inputs'))
		.flatMap(file => read_json<CapturedInputs>(join(DATA_DIR, 'inputs', file))?.recorded ?? [])
	globalThis.fetch = create_replay_fetch({ real_fetch, recorded, live_origins: [GATEWAY_ORIGIN] })
})

afterAll(() => {
	globalThis.fetch = real_fetch
})

test.concurrent.for(EVAL_CASES)('$id', async (eval_case, { skip }) => {
	const path = run_path({ variant: variant.name, case_id: eval_case.id })
	if (!force && read_json<CaseRun>(path)) skip('already run (pass --force to redo)')
	if (!read_json<CapturedInputs>(inputs_path(eval_case.id))) throw new Error(`No captured inputs for ${eval_case.id}. Run the capture step first.`)

	const { ai, calls } = create_eval_ai_client({ variant, gateway })
	const started_at = Date.now()
	const result = await run_pipeline({ eval_case, ai })
	expect(result.type, result.type === 'error' ? result.error : '').not.toBe('error')

	const run: CaseRun = { case_id: eval_case.id, variant: variant.name, ran_at: new Date().toISOString(), duration_ms: Date.now() - started_at, result, calls }
	write_json({ path, value: run })
})

// The same steps as the single-verse route (routes/[book]/[chapter]/[verse]/+server.ts).
async function run_pipeline({ eval_case, ai }: { eval_case: EvalCase, ai: AiClient }): Promise<CopilotResult> {
	const { reference, settings } = eval_case
	const result = await get_verse_result({ reference, settings, ai })
	if (result.type === 'error' || settings.mode !== 'brief' || settings.lwc === 'English') return result
	return translate_json({ obj: result, ai })
}
