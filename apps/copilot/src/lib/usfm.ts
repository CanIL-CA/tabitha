import { BRIEF_HEADINGS_ENGLISH, get_no_notes_text, get_no_tnn_text } from './lookups'
import type { CopilotBriefHeadingsResult, CopilotBriefResult, CopilotBriefSection, CopilotDiscernResult, CopilotResult } from '@tabitha/types'

export function convert_to_usfm_document({ book_code, results, lwc, headings }: { book_code: string, results: CopilotResult[], lwc: string, headings?: CopilotBriefHeadingsResult }): string {
	const verse_lines = results.flatMap((result, i) => {
		const is_new_chapter = result.verse.chapter !== results[i - 1]?.verse.chapter
		const verse_usfm = convert_to_usfm({ result, lwc, headings })
		return is_new_chapter ? [`\\c ${result.verse.chapter}`, verse_usfm] : [verse_usfm]
	})
	return [`\\id ${book_code}`, ...verse_lines].join('\n')
}

export function convert_to_usfm({ result, lwc, headings }: { result: CopilotResult, lwc: string, headings?: CopilotBriefHeadingsResult }): string {
	if (result.type === 'error') {
		return `\\p \\v ${result.verse.verse} Unexpected issue getting notes for this verse: ${result.error}`
	} else if (result.type === 'discern') {
		return convert_to_usfm_for_discern({ result, lwc })
	} else {
		return convert_to_usfm_for_brief({ result, lwc, headings: headings ?? BRIEF_HEADINGS_ENGLISH })
	}
}

function convert_to_usfm_for_brief({ result, lwc, headings }: { result: CopilotBriefResult, lwc: string, headings: CopilotBriefHeadingsResult }): string {
	function create_section<T extends CopilotBriefSection>({ section, transformer, empty_text }: { section: T, transformer?: (item: CopilotBriefResult[T][number]) => string, empty_text?: string }): string[] {
		const items = result[section]
		if (!items.length && !empty_text) {
			return []
		}
		const lines = items.length ? items.map(transformer ?? (item => item)) : [empty_text]
		return [
			`\\s ${headings[section]}`,
			...lines.map(s => `\\iex ${s}`),
		]
	}

	return [
		`\\v ${result.verse.verse} ${result.lwc_text}`,
		...create_section({
			section: 'semantic_notes',
			transformer: note => {
				const lwc_span = note.quoted_text ? `"${note.quoted_text}" — ` : ''
				return `${lwc_span}(${note.trigger.name}) ${note.meaning} ${note.check}`
			},
			empty_text: get_no_notes_text(lwc),
		}),
		...create_section({
			section: 'tnn_notes',
			empty_text: get_no_tnn_text({ lwc, tnn_available: result.tnn_available }),
		}),
		...create_section({
			section: 'cultural_background',
			transformer: ({ term, summary }) => `${term} — ${summary}`,
		}),
		...create_section({ section: 'image_keywords' }),
		...create_section({
			section: 'consultant_decisions',
			transformer: ({ status, text }) => `${status} — ${text}`,
		}),
	].join('\n')
}

function convert_to_usfm_for_discern({ result, lwc }: { result: CopilotDiscernResult, lwc: string }): string {
	// Convert the results to Paratext SFM format:
	//   \p \v [verse number] TBTA English
	//   \p Second language (if present)
	//   \li First suggestion
	//   \li Second suggestion...
	const notes = result.notes.length
		? result.notes.map(({ quoted_text, meaning, check }) => `"...${quoted_text}..." - ${meaning} ${check}`)
		: [get_no_notes_text(lwc)]
	return [
		`\\p \\v ${result.verse.verse} ${result.english_text}`,
		...result.lwc_text ? [`\\p ${result.lwc_text}`] : [],
		...notes.map(c => `\\li - ${c}`),
	].join('\n')
}