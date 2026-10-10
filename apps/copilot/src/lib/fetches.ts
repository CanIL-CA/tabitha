import { PUBLIC_SOURCES_API_HOST, PUBLIC_TARGETS_API_HOST } from '$env/static/public'
import { create_sources_client, create_targets_client } from '@tabitha/api-client'
import { BRIEF_HEADINGS_ENGLISH } from './lookups'
import { read_ndjson_stream } from './ndjson'
import type { Reference, SourceSimpleJsonResult, TargetTextData, VerseReference } from '@tabitha/types'
import type { CopilotBriefHeadingsResult, CopilotResult } from '@tabitha/types/copilot'
import type { CopilotSettings, CopilotStep, CopilotStreamLine, ChapterReference } from '#lib/types.js'

const sources_client = create_sources_client({ base_url: PUBLIC_SOURCES_API_HOST, cache: true })
const targets_client = create_targets_client({ base_url: PUBLIC_TARGETS_API_HOST, cache: true })

export async function fetch_encoding(reference: VerseReference): Promise<SourceSimpleJsonResult | null> {
	return sources_client.get_simplified_json({ ref: verse_to_source_ref(reference), include_glosses: true })
}

export async function fetch_target_text({ reference, project, preferred_audience }: { reference: VerseReference, project: string, preferred_audience: string }): Promise<TargetTextData | null> {
	return targets_client.get_target_text({ ref: verse_to_source_ref(reference), project, preferred_audience })
}

export async function fetch_chapters_for_book({ book }: Pick<ChapterReference, 'book'>): Promise<number | null> {
	return sources_client.get_book_chapters_count({ type: 'Bible', id_primary: book })
}

export async function fetch_verses_for_chapter({ book, chapter }: ChapterReference): Promise<number | null> {
	return sources_client.get_chapter_verses_count({ type: 'Bible', id_primary: book, id_secondary: chapter.toString() })
}

export async function fetch_batch_cautions({ reference, start_verse, end_verse, settings, on_progress }: {
	reference: ChapterReference
	start_verse: number
	end_verse: number
	settings: CopilotSettings
	on_progress: (next_results: CopilotResult[]) => void
}): Promise<void> {
	const { book, chapter } = reference
	const params = JSON.stringify(settings)
	const response = await fetch(`/${book}/${chapter}?v0=${start_verse}&v1=${end_verse}&settings=${encodeURIComponent(params)}`)

	if (!response.ok || !response.body) {
		const message = await response.text() || 'Unexpected error occurred'
		throw new Error(message)
	}

	await read_ndjson_stream<CopilotResult>({ body: response.body, on_items: on_progress })
}

export async function fetch_book_cautions({ book, start_chapter, end_chapter, settings, on_verse_count, on_progress }: {
	book: string
	start_chapter: number
	end_chapter: number
	settings: CopilotSettings
	on_verse_count: (verse_count: number) => void
	on_progress: (next_results: CopilotResult[]) => void
}): Promise<void> {
	const params = JSON.stringify(settings)
	const response = await fetch(`/${book}?c0=${start_chapter}&c1=${end_chapter}&settings=${encodeURIComponent(params)}`)

	if (!response.ok || !response.body) {
		const message = await response.text() || 'Unexpected error occurred'
		throw new Error(message)
	}

	on_verse_count(Number(response.headers.get('X-Verse-Count')) || 0)
	await read_ndjson_stream<CopilotResult>({ body: response.body, on_items: on_progress })
}

type FetchNotesOptions = {
	reference: VerseReference
	settings: CopilotSettings
	on_step?: (step: CopilotStep) => void
}

export async function fetch_notes({ reference, settings, on_step }: FetchNotesOptions): Promise<CopilotResult> {
	const { book, chapter, verse } = reference
	const params = JSON.stringify(settings)
	const response = await fetch(`/${book}/${chapter}/${verse}?settings=${encodeURIComponent(params)}`)

	if (!response.ok || !response.body) {
		return await response.json().catch(() => ({ type: 'error', verse: reference, error: 'Unexpected error occurred.' })) as CopilotResult
	}

	let result: CopilotResult = { type: 'error', verse: reference, error: 'No result was received from the server.' }
	await read_ndjson_stream<CopilotStreamLine>({
		body: response.body,
		on_items: lines => {
			for (const line of lines) {
				if (line.type === 'step') on_step?.(line.step)
				else result = line
			}
		},
	})
	return result
}

export async function fetch_brief_headings(lwc: string): Promise<CopilotBriefHeadingsResult> {
	if (lwc === 'English') {
		return BRIEF_HEADINGS_ENGLISH
	}
	const response = await fetch(`/lookup/brief_headings?lwc=${lwc}`)
	if (!response.ok) {
		console.warn(`Could not fetch brief headings for ${lwc}. Defaulting to English.`)
		return BRIEF_HEADINGS_ENGLISH
	}

	return await response.json() as CopilotBriefHeadingsResult
}

function verse_to_source_ref({ book, chapter, verse }: VerseReference): Reference {
	return { type: 'Bible', id_primary: book, id_secondary: chapter.toString(), id_tertiary: verse.toString() }
}
