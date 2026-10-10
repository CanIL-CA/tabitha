import { default_settings } from '#lib/lookups.js'
import { fetch_chapters_for_book, fetch_verses_for_chapter } from '#lib/fetches.js'
import { error } from '@sveltejs/kit'
import { get_request_caller, record_usage_event } from '@tabitha/usage'
import { get_verse_result } from '#lib/server/verse_result.js'
import { translate_json } from '#lib/server/brief/brief.js'
import { to_copilot_run_event } from '#lib/server/usage.js'
import type { RequestHandler } from './$types'
import type { CopilotResult, VerseReference } from '@tabitha/types'
import type { CopilotSettings } from '#lib/types.js'

export async function GET({ params: { book }, url: { searchParams }, locals: { ai }, request, platform }: Parameters<RequestHandler>[0]) {
	let start_chapter = searchParams.has('c0') ? parseInt(searchParams.get('c0')!) : 1
	let end_chapter = searchParams.has('c1') ? parseInt(searchParams.get('c1')!) : null

	const param_settings = JSON.parse(searchParams.get('settings') || '{}')
	const settings: CopilotSettings = {
		...default_settings,
		...param_settings,
		language_profile: {
			...default_settings.language_profile,
			...param_settings.language_profile ?? {},
		},
	}

	const last_chapter = await fetch_chapters_for_book({ book })
	if (!last_chapter) {
		console.error(`Error fetching chapters for ${book}`)
		error(404, 'Book reference does not exist')
	}

	if (!start_chapter) {
		start_chapter = 1
	} else if (start_chapter > last_chapter) {
		start_chapter = last_chapter
	}
	if (!end_chapter || end_chapter > last_chapter) {
		end_chapter = last_chapter
	}

	const chapters = Array.from({ length: end_chapter - start_chapter + 1 }, (_, i) => start_chapter + i)
	const verse_counts = await Promise.all(chapters.map(chapter => fetch_verses_for_chapter({ book, chapter })))
	const references: VerseReference[] = chapters.flatMap((chapter, i) =>
		Array.from({ length: verse_counts[i] ?? 0 }, (_, v) => ({ book, chapter, verse: v + 1 })),
	)

	const total_verses = references.length
	if (!total_verses) {
		error(404, 'Chapter range has no verses')
	}

	const stream = new ReadableStream({
		async start(controller) {
			const verse_results: CopilotResult[] = new Array(total_verses)

			try {
				const concurrency_limit = 5
				let next_to_send = 0
				let next_to_start = 0
				let is_flushing = false

				// Flush ready sequential results to controller (translating in batches if in brief mode)
				async function flush() {
					if (is_flushing) return
					is_flushing = true

					try {
						while (next_to_send < total_verses && verse_results[next_to_send] !== undefined) {
							// Collect contiguous ready untranslated verses
							const batch = []
							while (next_to_send < total_verses && verse_results[next_to_send] !== undefined) {
								batch.push(verse_results[next_to_send])
								next_to_send++
							}

							// Translate batch in 1 LLM API call if in brief mode
							const translated_batch = settings.mode === 'brief'
								? await translate_json({ obj: batch, ai })
								: batch

							// Enqueue translated verses
							for (const result of translated_batch) {
								controller.enqueue(`${JSON.stringify(result)}\n`)
							}
						}
					} finally {
						is_flushing = false
					}
				}

				async function worker() {
					while (next_to_start < total_verses) {
						const verse_idx = next_to_start++
						const reference = references[verse_idx]

						verse_results[verse_idx] = await get_verse_result({ reference, settings, ai })

						await flush()
					}
				}

				// Launch workers up to concurrency_limit
				const workers = []
				for (let i = 0; i < Math.min(concurrency_limit, total_verses); i++) {
					workers.push(worker())
				}

				await Promise.all(workers)
			} catch (err) {
				console.error('Error in batch streaming:', err)
				controller.error(err)
			} finally {
				record_usage_event({
					dataset: platform?.env.USAGE,
					app: 'copilot',
					event: to_copilot_run_event({
						caller: get_request_caller(request),
						run: 'batch',
						book,
						settings,
						verse_count: total_verses,
						results: verse_results.filter(Boolean),
					}),
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
			'X-Verse-Count': String(total_verses),
		},
	})
}
