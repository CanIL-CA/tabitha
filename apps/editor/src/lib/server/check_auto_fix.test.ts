import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { expand_token, run_check, run_check_with_auto_fixes } from './check'
import type { CheckerToken, OntologyResult, PartOfSpeech, TargetFormResult } from '@tabitha/types'

type Concept = { sense: string; part_of_speech: PartOfSpeech; level: number; categorization: string }

// Only the senses these sentences need, with just the fields the checker reads
const ONTOLOGY: Record<string, Concept[]> = {
	all: [{ sense: 'A', part_of_speech: 'Adjective', level: 0, categorization: '' }],
	day: [{ sense: 'A', part_of_speech: 'Noun', level: 0, categorization: 'o' }],
	go: [{ sense: 'A', part_of_speech: 'Verb', level: 1, categorization: 'A__de_g__' }],
	jerusalem: [{ sense: 'A', part_of_speech: 'Noun', level: 4, categorization: 'L' }],
	john: [{ sense: 'A', part_of_speech: 'Noun', level: 4, categorization: 'M' }],
	man: [{ sense: 'A', part_of_speech: 'Noun', level: 1, categorization: 'o' }],
	one: [{ sense: 'A', part_of_speech: 'Adjective', level: 0, categorization: '' }],
	person: [{ sense: 'A', part_of_speech: 'Noun', level: 0, categorization: 'o' }],
	see: [{ sense: 'A', part_of_speech: 'Verb', level: 0, categorization: 'AB_______' }],
}

// Inflected words only; any other word is looked up in the Ontology as written
const FORMS: Record<string, Pick<TargetFormResult, 'stem' | 'part_of_speech' | 'form'>> = {
	people: { stem: 'person', part_of_speech: 'Noun', form: 'Plural' },
	saw: { stem: 'see', part_of_speech: 'Verb', form: 'Past' },
	went: { stem: 'go', part_of_speech: 'Verb', form: 'Past' },
}

function search_ontology(query: string): OntologyResult[] {
	const concepts = ONTOLOGY[query.toLowerCase()] ?? []
	const stem = query.toLowerCase() === query ? query : query[0].toUpperCase() + query.slice(1).toLowerCase()
	return concepts.map(concept => ({ ...concept, stem, level: String(concept.level), status: 'in ontology', how_to_hints: [] }) as unknown as OntologyResult)
}

function lookup_forms(word: string): Partial<TargetFormResult>[] {
	const form = FORMS[word]
	return form ? [form] : []
}

beforeAll(() => {
	vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
		const { terms, words }: { terms?: string[]; words?: string[] } = JSON.parse(String(init?.body))
		return Response.json(terms
			? Object.fromEntries(terms.map(term => [term, search_ontology(term)]))
			: Object.fromEntries((words ?? []).map(word => [word, lookup_forms(word)])))
	})
})

afterAll(() => {
	vi.unstubAllGlobals()
})

function auto_fixed_tokens(tokens: CheckerToken[]): CheckerToken[] {
	return tokens.flatMap(expand_token).filter(token => token.auto_fix)
}

function added_tokens(tokens: CheckerToken[]): string[] {
	return tokens.flatMap(expand_token).filter(token => token.type === 'Added').map(token => token.token)
}

describe('auto-fixes', () => {
	test("inserts 'of' after 'all' before a determiner, and checks the fixed text", async () => {
		const result = await run_check_with_auto_fixes('John saw all the people.')

		expect(result.auto_fixes).toEqual([{ offset: 12, text: ' of' }])
		expect(added_tokens(result.tokens)).not.toContain('of')

		const [of_token] = auto_fixed_tokens(result.tokens)
		expect(of_token.token).toBe('of')
		expect(of_token.auto_fix).toEqual({ message: expect.stringMatching(/^Use 'all of'/), text: ' of', start: 12, end: 15 })
	})

	test("inserts a comma after 'One day'", async () => {
		const result = await run_check_with_auto_fixes('One day that man went to Jerusalem.')

		expect(result.auto_fixes).toEqual([{ offset: 7, text: ',' }])
		expect(auto_fixed_tokens(result.tokens).map(({ token, auto_fix }) => [token, auto_fix?.start, auto_fix?.end])).toEqual([[',', 7, 8]])
	})

	test('applies several fixes in one check', async () => {
		const result = await run_check_with_auto_fixes('One day that man saw all the people.')

		expect(result.auto_fixes).toEqual([{ offset: 7, text: ',' }, { offset: 24, text: ' of' }])
		expect(auto_fixed_tokens(result.tokens).map(({ token, auto_fix }) => [token, auto_fix?.start, auto_fix?.end])).toEqual([[',', 7, 8], ['of', 25, 28]])
	})

	test('leaves text that needs no fixes alone', async () => {
		const result = await run_check_with_auto_fixes('John saw all of the people.')

		expect(result.auto_fixes).toBeUndefined()
		expect(auto_fixed_tokens(result.tokens)).toEqual([])
	})

	test('a plain check still only suggests the fix', async () => {
		const result = await run_check('John saw all the people.')

		expect(result.auto_fixes).toBeUndefined()
		expect(added_tokens(result.tokens)).toContain('of')
	})
})
