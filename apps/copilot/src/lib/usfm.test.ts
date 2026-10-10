import { describe, expect, test } from 'vitest'
import { convert_to_usfm, convert_to_usfm_document } from './usfm'
import { BRIEF_HEADINGS_ENGLISH } from './lookups'
import type { CopilotBriefResult, CopilotDiscernResult, CopilotErrorResult, CopilotResult, VerseReference } from '@tabitha/types'

const verse: VerseReference = { book: 'Genesis', chapter: 1, verse: 1 }

function discern_result(overrides: Partial<CopilotDiscernResult> = {}): CopilotResult {
	return {
		type: 'discern',
		verse,
		english_text: 'In the beginning God created the heavens and the earth.',
		notes: [],
		...overrides,
	}
}
function brief_result(overrides: Partial<CopilotBriefResult> = {}): CopilotResult {
	return {
		type: 'brief',
		verse,
		lwc_text: 'In the beginning God created the heavens and the earth.',
		semantic_notes: [],
		tnn_available: true,
		tnn_notes: [],
		cultural_background: [],
		image_keywords: [],
		consultant_decisions: [],
		...overrides,
	}
}
function error_result(overrides: Partial<CopilotErrorResult> = {}): CopilotResult {
	return {
		type: 'error',
		verse,
		error: 'An error occurred',
		...overrides,
	}
}

describe('convert_to_usfm', () => {
	test('renders an error line when the result has an error', async () => {
		const sfm = await convert_to_usfm({ result: error_result({ error: 'no text' }), lwc: 'English' })

		expect(sfm).toBe('\\p \\v 1 Unexpected issue getting notes for this verse: no text')
	})

	test('discern - falls back to the LWC no-notes text when there are no notes', async () => {
		const sfm = await convert_to_usfm({ result: discern_result(), lwc: 'English' })

		expect(sfm).toBe([
			'\\p \\v 1 In the beginning God created the heavens and the earth.',
			'\\li - No notes for this verse based on the TBTA analysis.',
		].join('\n'))
	})

	test('discern - renders one \\li line per note, and an optional \\p line for the LWC text', async () => {
		const result = discern_result({
			lwc_text: 'Na mwanzo Mungu aliumba mbingu na dunia.',
			notes: [
				{ meaning: 'Meaning one.', check: 'Check one.', quoted_text: 'beginning', trigger: { name: 'trigger-1', node_id: '1', flags: [], weight: 1 } },
				{ meaning: 'Meaning two.', check: 'Check two.', quoted_text: 'earth', trigger: { name: 'trigger-2', node_id: '2', flags: [], weight: 1 } },
			],
		})

		const sfm = await convert_to_usfm({ result, lwc: 'English' })

		expect(sfm).toBe([
			'\\p \\v 1 In the beginning God created the heavens and the earth.',
			'\\p Na mwanzo Mungu aliumba mbingu na dunia.',
			'\\li - "...beginning..." - Meaning one. Check one.',
			'\\li - "...earth..." - Meaning two. Check two.',
		].join('\n'))
	})

	test('brief - always renders the semantic and TNN sections, omitting the other empty sections', async () => {
		const sfm = await convert_to_usfm({ result: brief_result(), lwc: 'English' })

		expect(sfm).toBe([
			'\\v 1 In the beginning God created the heavens and the earth.',
			`\\s ${BRIEF_HEADINGS_ENGLISH.semantic_notes}`,
			'\\iex No notes for this verse based on the TBTA analysis.',
			`\\s ${BRIEF_HEADINGS_ENGLISH.tnn_notes}`,
			'\\iex No translator notes remained for this verse after filtering.',
		].join('\n'))
	})

	test('brief - uses the no-Aquifer-coverage text when TNN is unavailable', async () => {
		const sfm = await convert_to_usfm({ result: brief_result({ tnn_available: false }), lwc: 'English' })

		expect(sfm).toBe([
			'\\v 1 In the beginning God created the heavens and the earth.',
			`\\s ${BRIEF_HEADINGS_ENGLISH.semantic_notes}`,
			'\\iex No notes for this verse based on the TBTA analysis.',
			`\\s ${BRIEF_HEADINGS_ENGLISH.tnn_notes}`,
			'\\iex No Aquifer translator notes are available for this verse.',
		].join('\n'))
	})

	test('brief - renders one \\iex per note per section', async () => {
		const result = brief_result({
			lwc_text: 'In the beginning God created the heavens and the earth.',
			semantic_notes: [
				{ meaning: 'Meaning one.', check: 'Check one.', quoted_text: 'beginning', trigger: { name: 'trigger-1', node_id: '1', flags: [], weight: 1 } },
				{ meaning: 'Meaning two.', check: 'Check two.', quoted_text: 'earth', trigger: { name: 'trigger-2', node_id: '2', flags: [], weight: 1 } },
			],
			tnn_notes: ['tnn note one.', 'tnn note two.'],
			cultural_background: [
				{ term: 'cultural one', summary: 'summary one' },
				{ term: 'background two', summary: 'summary two' },
			],
			image_keywords: ['keyword one', 'keyword two'],
			consultant_decisions: [
				{ status: 'CONFLICT', text: 'decision one' },
				{ status: 'UNRESOLVED', text: 'decision two' },
			],
		})
		const sfm = await convert_to_usfm({ result, lwc: 'English' })

		expect(sfm).toBe([
			'\\v 1 In the beginning God created the heavens and the earth.',
			`\\s ${BRIEF_HEADINGS_ENGLISH.semantic_notes}`,
			'\\iex "beginning" — (trigger-1) Meaning one. Check one.',
			'\\iex "earth" — (trigger-2) Meaning two. Check two.',
			`\\s ${BRIEF_HEADINGS_ENGLISH.tnn_notes}`,
			'\\iex tnn note one.',
			'\\iex tnn note two.',
			`\\s ${BRIEF_HEADINGS_ENGLISH.cultural_background}`,
			'\\iex cultural one — summary one',
			'\\iex background two — summary two',
			`\\s ${BRIEF_HEADINGS_ENGLISH.image_keywords}`,
			'\\iex keyword one',
			'\\iex keyword two',
			`\\s ${BRIEF_HEADINGS_ENGLISH.consultant_decisions}`,
			'\\iex CONFLICT — decision one',
			'\\iex UNRESOLVED — decision two',
		].join('\n'))
	})
})

describe('convert_to_usfm_document', () => {
	test('starts with the book id and marks the first chapter', () => {
		const usfm = convert_to_usfm_document({ book_code: 'GEN', results: [error_result()], lwc: 'en' })
		expect(usfm.split('\n').slice(0, 2)).toEqual(['\\id GEN', '\\c 1'])
	})

	test('adds a chapter marker only when the chapter changes', () => {
		const results = [
			error_result({ verse: { book: 'Genesis', chapter: 1, verse: 30 } }),
			error_result({ verse: { book: 'Genesis', chapter: 1, verse: 31 } }),
			error_result({ verse: { book: 'Genesis', chapter: 2, verse: 1 } }),
		]
		const chapter_markers = convert_to_usfm_document({ book_code: 'GEN', results, lwc: 'en' })
			.split('\n')
			.filter(line => line.startsWith('\\c '))
		expect(chapter_markers).toEqual(['\\c 1', '\\c 2'])
	})
})
