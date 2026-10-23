import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { perform_form_lookups, perform_ontology_lookups } from './index'
import { TOKEN_TYPE, create_token } from '#lib/token.js'
import { create_lookup_token_for_test, create_sentence_for_test, lookup_result_for_test } from '#lib/test_helps.js'
import type { Sentence, Token } from '#lib/types.js'

describe('lookups module', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({}),
		}))
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test('perform_form_lookups on empty sentence returns empty array', async () => {
		const result = await perform_form_lookups([])
		expect(result).toEqual([])
	})

	test('perform_form_lookups flattens clauses and paired tokens for lookup', async () => {
		const main_token = create_token({ token: 'verbs', type: TOKEN_TYPE.LOOKUP_WORD })
		const paired_token = create_token({ token: 'dogs', type: TOKEN_TYPE.LOOKUP_WORD })
		main_token.pairing = paired_token

		const clause_token = create_token({ token: '', type: TOKEN_TYPE.CLAUSE, sub_tokens: [main_token] })

		const sentences: Sentence[] = [{ clause: clause_token }]
		const result = await perform_form_lookups(sentences)

		expect(result).toBeDefined()
		expect(result[0].clause.sub_tokens[0].token).toBe('verbs')
	})

	test('perform_ontology_lookups filters capitalization and handles null token pairing', async () => {
		const lower_token = create_token({ token: 'dog', type: TOKEN_TYPE.LOOKUP_WORD })
		const null_token = create_token({ token: 'null', type: TOKEN_TYPE.LOOKUP_WORD })
		lower_token.pairing = null_token

		const sentences: Sentence[] = [{ clause: create_token({ token: '', type: TOKEN_TYPE.CLAUSE, sub_tokens: [lower_token] }) }]
		const result = await perform_ontology_lookups(sentences)

		expect(result).toBeDefined()
	})
})

describe('removing results that are only in the English lexicon', () => {
	const life_noun_in_ontology = { id: 2013, stem: 'life', sense: 'A', part_of_speech: 'Noun', level: '1', gloss: '', categorization: 'A', categories: [], status: 'in ontology', how_to_hints: [] }

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function stub_ontology_search({ term, results }: { term: string, results: object[] }) {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ [term]: results }) }))
	}

	function lookup_sentence_with(token: Token): Sentence[] {
		return [create_sentence_for_test([token])]
	}

	test('a lexicon-only part of speech is removed when the word is in the Ontology: God gives life to all people. (cf. Acts 17:25)', async () => {
		stub_ontology_search({ term: 'life', results: [life_noun_in_ontology] })
		const life_token = create_lookup_token_for_test({ token: 'life', lookup_terms: ['life'], lookup_results: [
			lookup_result_for_test({ stem: 'life', sense: '', part_of_speech: 'Noun', ontology_status: 'unknown' }),
			lookup_result_for_test({ stem: 'life', sense: '', part_of_speech: 'Adjective', ontology_status: 'unknown' }),
		] })

		await perform_ontology_lookups(lookup_sentence_with(life_token))

		expect(life_token.lookup_results.map(result => `${result.stem}-${result.sense} ${result.part_of_speech}`)).toEqual(['life-A Noun'])
	})
	test('lexicon results are kept when the word is not in the Ontology at all: Peter looked intently at him. (cf. Acts 3:4)', async () => {
		stub_ontology_search({ term: 'intently', results: [] })
		const intently_token = create_lookup_token_for_test({ token: 'intently', lookup_terms: ['intently'], lookup_results: [
			lookup_result_for_test({ stem: 'intently', sense: '', part_of_speech: 'Adverb', ontology_status: 'unknown' }),
		] })

		await perform_ontology_lookups(lookup_sentence_with(intently_token))

		expect(intently_token.lookup_results.map(result => result.part_of_speech)).toEqual(['Adverb'])
	})
})

describe('words that differ only by capitalization', () => {
	// The Ontology holds a different concept for each capitalization, e.g. Lot (a person) and lot (a share)
	const CONCEPTS = [
		{ stem: 'Lot', part_of_speech: 'Noun' },
		{ stem: 'lot', part_of_speech: 'Noun' },
		{ stem: 'Mark', part_of_speech: 'Noun' },
		{ stem: 'mark', part_of_speech: 'Noun' },
		{ stem: 'mark', part_of_speech: 'Verb' },
	].map(concept => ({ ...concept, sense: 'A', level: '1', gloss: '', categorization: 'A', categories: [], status: 'in ontology', how_to_hints: [] }))

	let requested_term_batches: string[][]

	beforeEach(() => {
		requested_term_batches = []
		// Like the real service: terms match case-insensitively, and every capitalization of the stem is returned
		vi.stubGlobal('fetch', async (_input: string | URL | Request, init?: RequestInit) => {
			const { terms }: { terms: string[] } = JSON.parse(String(init?.body))
			requested_term_batches.push(terms)
			return Response.json(Object.fromEntries(terms.map(term => [term, CONCEPTS.filter(concept => concept.stem.toLowerCase() === term.toLowerCase())])))
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function stems_and_parts_of_speech(token: Token): string[] {
		return token.lookup_results.map(result => `${result.stem} ${result.part_of_speech}`)
	}

	test('each capitalization keeps only its own concept: Abram took Lot with him, and they cast a lot. (cf. Gen 12:4)', async () => {
		const person_token = create_lookup_token_for_test({ token: 'Lot', lookup_terms: ['Lot'] })
		const share_token = create_lookup_token_for_test({ token: 'lot', lookup_terms: ['lot'] })

		await perform_ontology_lookups([create_sentence_for_test([person_token, share_token])])

		expect(stems_and_parts_of_speech(person_token)).toEqual(['Lot Noun'])
		expect(stems_and_parts_of_speech(share_token)).toEqual(['lot Noun'])
	})

	test('a lowercase word keeps every lowercase part of speech, and a capitalized one only the proper noun: Mark the place where Mark stood.', async () => {
		const verb_token = create_lookup_token_for_test({ token: 'mark', lookup_terms: ['mark'] })
		const person_token = create_lookup_token_for_test({ token: 'Mark', lookup_terms: ['Mark'] })

		await perform_ontology_lookups([create_sentence_for_test([verb_token, person_token])])

		expect(stems_and_parts_of_speech(verb_token)).toEqual(['mark Noun', 'mark Verb'])
		expect(stems_and_parts_of_speech(person_token)).toEqual(['Mark Noun'])
	})

	test('a capitalized first word uses the proper noun, since it has no capitalization to go by: Lot looked at all of the places. (cf. Gen 13:10)', async () => {
		const person_token = create_lookup_token_for_test({ token: 'Lot', lookup_terms: ['Lot'], tag: { 'position': 'first_word' } })

		await perform_ontology_lookups([create_sentence_for_test([person_token])])

		expect(stems_and_parts_of_speech(person_token)).toEqual(['Lot Noun'])
	})

	test('a capitalized first word keeps lowercase concepts of other parts of speech: Mark the place where Mark stood.', async () => {
		const first_token = create_lookup_token_for_test({ token: 'Mark', lookup_terms: ['Mark'], tag: { 'position': 'first_word' } })

		await perform_ontology_lookups([create_sentence_for_test([first_token])])

		expect(stems_and_parts_of_speech(first_token)).toEqual(['Mark Noun', 'mark Verb'])
	})

	test('both capitalizations are searched once, as the lowercase term', async () => {
		const tokens = ['Lot', 'lot', 'Mark', 'mark', 'mark'].map(token => create_lookup_token_for_test({ token, lookup_terms: [token] }))

		await perform_ontology_lookups([create_sentence_for_test(tokens)])

		expect(requested_term_batches).toEqual([['lot', 'mark']])
	})
})
