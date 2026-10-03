import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { perform_form_lookups, perform_ontology_lookups } from './index'
import { TOKEN_TYPE, create_token } from '$lib/token'
import { create_lookup_token_for_test, create_sentence_for_test, lookup_result_for_test } from '$lib/test_helps'
import type { Sentence, Token } from '$lib/types'

describe('lookups module', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [],
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

	function stub_ontology_search(results: object[]) {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => results }))
	}

	function lookup_sentence_with(token: Token): Sentence[] {
		return [create_sentence_for_test([token])]
	}

	test('a lexicon-only part of speech is removed when the word is in the Ontology: God gives life to all people. (cf. Acts 17:25)', async () => {
		stub_ontology_search([life_noun_in_ontology])
		const life_token = create_lookup_token_for_test({ token: 'life', lookup_terms: ['life'], lookup_results: [
			lookup_result_for_test({ stem: 'life', sense: '', part_of_speech: 'Noun', ontology_status: 'unknown' }),
			lookup_result_for_test({ stem: 'life', sense: '', part_of_speech: 'Adjective', ontology_status: 'unknown' }),
		] })

		await perform_ontology_lookups(lookup_sentence_with(life_token))

		expect(life_token.lookup_results.map(result => `${result.stem}-${result.sense} ${result.part_of_speech}`)).toEqual(['life-A Noun'])
	})
	test('lexicon results are kept when the word is not in the Ontology at all: Peter looked intently at him. (cf. Acts 3:4)', async () => {
		stub_ontology_search([])
		const intently_token = create_lookup_token_for_test({ token: 'intently', lookup_terms: ['intently'], lookup_results: [
			lookup_result_for_test({ stem: 'intently', sense: '', part_of_speech: 'Adverb', ontology_status: 'unknown' }),
		] })

		await perform_ontology_lookups(lookup_sentence_with(intently_token))

		expect(intently_token.lookup_results.map(result => result.part_of_speech)).toEqual(['Adverb'])
	})
})
