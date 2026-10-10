import { get_copilot_result } from '#lib/server/copilot_core.js'
import { create_brief_for_verse } from '#lib/server/brief/brief.js'
import { book_rigors } from '#lib/lookups.js'
import type { AiClient } from '@tabitha/ai'
import type { VerseReference, CopilotResult } from '@tabitha/types'
import type { BriefInput, CopilotSettings, CopilotStep } from '#lib/types.js'

type GetVerseResultOptions = {
	reference: VerseReference
	settings: CopilotSettings
	ai: AiClient
	on_step?: (step: CopilotStep) => void
}

export async function get_verse_result({ reference, settings, ai, on_step }: GetVerseResultOptions): Promise<CopilotResult> {
	on_step?.('notes')
	const result = await get_copilot_result({ reference, settings, ai })
	if (result.type === 'error' || settings.mode !== 'brief') return result

	const brief_input: BriefInput = {
		verse: reference,
		notes_result: result,
		settings: {
			...settings,
			rigor: book_rigors.get(reference.book) ?? 'LOW',
			output_format: 'usfm',
			output_style: 'production',
		},
	}
	return await create_brief_for_verse({ input: brief_input, ai, on_step })
}
