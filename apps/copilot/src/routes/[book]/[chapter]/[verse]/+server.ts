import { error } from '@sveltejs/kit'
import { get_request_caller, record_usage_event } from '@tabitha/usage'
import { get_verse_result } from '#lib/server/verse_result.js'
import { default_settings } from '#lib/lookups.js'
import { translate_json } from '#lib/server/brief/brief.js'
import { to_copilot_run_event } from '#lib/server/usage.js'
import type { RequestHandler } from './$types'
import type { CopilotResult, VerseReference } from '@tabitha/types'
import type { CopilotSettings, CopilotStep, CopilotStreamLine } from '#lib/types.js'

export async function GET({ params: { book, chapter, verse }, url: { searchParams }, locals: { ai }, request, platform }: Parameters<RequestHandler>[0]) {
	const chapter_int = parseInt(chapter)
	const verse_int = parseInt(verse)
	if (!chapter_int || !verse_int) {
		error(400, 'chapter or verse must be integers')
	}

	const param_settings = JSON.parse(searchParams.get('settings') || '{}')
	const settings: CopilotSettings = {
		...default_settings,
		...param_settings,
		language_profile: {
			...default_settings.language_profile,
			...param_settings.language_profile ?? {},
		},
	}

	const reference: VerseReference = { book, chapter: chapter_int, verse: verse_int }

	const stream = new ReadableStream<string>({
		async start(controller) {
			const send = (line: CopilotStreamLine) => controller.enqueue(`${JSON.stringify(line)}\n`)
			const on_step = (step: CopilotStep) => send({ type: 'step', step })
			let result: CopilotResult | undefined

			try {
				result = await get_verse_result({ reference, settings, ai, on_step })
				if (result.type === 'error' || settings.mode !== 'brief' || settings.lwc === 'English') {
					send(result)
				} else {
					on_step('translate')
					send(await translate_json({ obj: result, ai }))
				}
			} catch (err) {
				console.error(`Error generating notes for ${book} ${chapter}:${verse}:`, err)
				result = { type: 'error', verse: reference, error: err instanceof Error ? err.message : 'Unexpected error occurred.' }
				send(result)
			} finally {
				record_usage_event({
					dataset: platform?.env.USAGE,
					app: 'copilot',
					event: to_copilot_run_event({ caller: get_request_caller(request), run: 'verse', book, settings, verse_count: 1, results: result ? [result] : [] }),
				})
				controller.close()
			}
		},
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			'X-Content-Type-Options': 'nosniff',
		},
	})
}
