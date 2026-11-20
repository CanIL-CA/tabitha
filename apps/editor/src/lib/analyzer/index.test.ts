import { beforeEach, describe, expect, test, vi } from 'vitest'
import { analyze, get_analyze_result } from './index'
import { parse } from '#lib/parser/index.ts'
import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'
import type { Sentence, Token } from '#lib/types.js'

vi.mock('#lib/parser/index.ts', () => ({ parse: vi.fn() }))
const parse_mock = vi.mocked(parse)

describe('analyze pipeline', () => {
	test('handles empty sentence list', () => {
		const result = analyze([])
		expect(result).toEqual([])
	})

	test('analyzes sentence with lookup tokens', () => {
		const noun_token = create_token({
			token: 'Paul',
			type: TOKEN_TYPE.LOOKUP_WORD,
			lookup_results: [create_lookup_result({ stem: 'Paul', part_of_speech: 'Noun', sense: 'A' })],
			tag: { noun_index: '1' },
		})
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [noun_token], tag: { clause_type: 'main_clause' } })

		const sentence: Sentence = {
			clause: main_clause,
		}

		const result = analyze([sentence])
		expect(result.length).toBeGreaterThan(0)
	})
})


describe('get_analyze_result', () => {
	const noun_token = ({ stem, ontology_status = 'in ontology' }: { stem: string; ontology_status?: 'in ontology' | 'unknown' }) => create_token({
		token: stem,
		type: TOKEN_TYPE.LOOKUP_WORD,
		lookup_results: [create_lookup_result({ stem, part_of_speech: 'Noun', sense: 'A', ontology_status })],
		tag: { noun_index: '1' },
	})
	const sentence_of = (...sub_tokens: Token[]): Sentence[] => [{
		clause: create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens, tag: { clause_type: 'main_clause' } }),
	}]
	const error_message = { label: 'error', severity: 0, message: 'bad', rule_id: 'test' } as const

	beforeEach(() => {
		parse_mock.mockReset()
	})

	test('returns ok with tokens and entities when there are no errors', async () => {
		parse_mock.mockResolvedValue(sentence_of(noun_token({ stem: 'Paul' })))

		const result = await get_analyze_result('Paul')

		expect(result.status).toBe('ok')
		expect(result.tokens).toHaveLength(1)
		expect(result.source_entities.length).toBeGreaterThan(0)
	})

	test('returns error without entities when parsing left an error', async () => {
		parse_mock.mockResolvedValue(sentence_of(create_token({ ...noun_token({ stem: 'Paul' }), messages: [error_message] })))

		const result = await get_analyze_result('Paul')

		expect(result.status).toBe('error')
		expect(result.source_entities).toEqual([])
		expect(result.tokens).toHaveLength(1)
		expect(result.tokens[0].sub_tokens[0].messages.map(({ message }) => message)).toEqual(['bad'])
	})

	test('returns error without entities when an analyzer checker rule finds an error', async () => {
		parse_mock.mockResolvedValue(sentence_of(noun_token({ stem: 'Zzyzx', ontology_status: 'unknown' })))

		const result = await get_analyze_result('Zzyzx')

		expect(result.status).toBe('error')
		expect(result.source_entities).toEqual([])
		expect(result.tokens[0].sub_tokens[0].messages.some(({ label }) => label === 'error')).toBe(true)
	})

	test('still returns ok when the checker rules only add warnings or suggestions', async () => {
		const word_to_be_removed = create_token({
			token: 'Paul',
			type: TOKEN_TYPE.LOOKUP_WORD,
			lookup_results: [create_lookup_result({ stem: 'Paul', part_of_speech: 'Noun', sense: 'A', ontology_status: 'in ontology', gloss: 'DELETE' })],
			tag: { noun_index: '1' },
		})
		parse_mock.mockResolvedValue(sentence_of(word_to_be_removed))

		const result = await get_analyze_result('Paul')

		expect(result.status).toBe('ok')
		expect(result.tokens[0].sub_tokens[0].messages.map(({ label }) => label)).toContain('warning')
		expect(result.source_entities.length).toBeGreaterThan(0)
	})
})
