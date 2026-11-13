import { describe, expect, test } from 'vitest'
import { order_constituents } from './ordering'
import { clause, np, phrase, vp, word } from './test_helps'
import { TOKEN_TYPE, create_token } from '#lib/token.js'
import type { Token } from '#lib/types.js'

describe('ordering', () => {
	const noun = (stem: string) => word({ stem, part_of_speech: 'Noun' })
	const advp = (stem: string) => phrase({ type: 'AdvP', contents: [word({ stem, part_of_speech: 'Adverb' })] })
	const adverbial_clause = ({ adposition, sub_tokens }: { adposition: string; sub_tokens: Token[] }) => clause({
		clause_type: 'adverbial_clause',
		sub_tokens: [word({ stem: adposition, part_of_speech: 'Adposition' }), ...sub_tokens],
	})
	const period = () => create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION })
	const order_main_clause = (sub_tokens: Token[]) => order_constituents([{ clause: clause({ clause_type: 'main_clause', sub_tokens }) }])[0].clause.sub_tokens
	const stems = (tokens: Token[]): string[] => tokens.flatMap(token => token.type === TOKEN_TYPE.CLAUSE ? stems(token.sub_tokens) : token.lookup_results.map(lookup => lookup.stem))

	test('places the agent NP before the verb and the patient NP directly after it', () => {
		const tokens = order_main_clause([
			...np({ role: 'patient', contents: [noun('letter')] }),
			...vp('write'),
			...np({ role: 'agent', contents: [noun('Paul')] }),
			...np({ role: 'destination', contents: [noun('Corinth')] }),
			period(),
		])

		expect(stems(tokens)).toEqual(['Paul', 'write', 'letter', 'Corinth'])
		expect(tokens.at(-1)?.token).toBe('.')
	})

	test('places an agent clause before the verb', () => {
		const agent_clause = clause({ clause_type: 'agent_clause', sub_tokens: vp('obey') })
		const tokens = order_main_clause([...vp('please'), ...np({ role: 'patient', contents: [noun('God')] }), agent_clause])

		expect(stems(tokens)).toEqual(['obey', 'please', 'God'])
	})

	test('orders nested clauses independently', () => {
		const patient_clause = clause({
			clause_type: 'patient_clause_different_participant',
			sub_tokens: [...vp('come'), ...np({ role: 'agent', contents: [noun('John')] })],
		})
		const tokens = order_main_clause([...vp('say'), ...np({ role: 'agent', contents: [noun('Paul')] }), patient_clause])

		expect(stems(tokens)).toEqual(['Paul', 'say', 'John', 'come'])
	})

	test('places adverb phrases at the end of the clause, before punctuation', () => {
		const exclamation = word({ stem: 'exclamation', part_of_speech: 'Particle' })
		const tokens = order_main_clause([
			...advp('quickly'),
			...np({ role: 'agent', contents: [noun('Paul')] }),
			...vp('write'),
			...np({ role: 'patient', contents: [noun('letter')] }),
			exclamation,
			period(),
		])

		expect(stems(tokens)).toEqual(['Paul', 'write', 'letter', 'quickly', 'exclamation'])
		expect(tokens.at(-1)?.token).toBe('.')
	})

	test('places an adverbial clause at the end of its parent clause when its adposition is listed', () => {
		const because_clause = adverbial_clause({ adposition: 'because', sub_tokens: vp('love') })
		const tokens = order_main_clause([because_clause, ...vp('write'), ...advp('quickly')])

		expect(stems(tokens)).toEqual(['write', 'quickly', 'because', 'love'])
	})

	test('leaves an adverbial clause in place when its adposition is not listed', () => {
		const when_clause = adverbial_clause({ adposition: 'when', sub_tokens: vp('arrive') })
		const tokens = order_main_clause([when_clause, ...vp('write')])

		expect(stems(tokens)).toEqual(['when', 'arrive', 'write'])
	})

	describe('within an NP', () => {
		// eg {NP<genitive_saxon> -Kinship John's}: phrasify puts the relation on the NP, and the relation word and the modifying noun carry it too
		const relation_np = ({ relation, adposition, modifier }: { relation: string; adposition: string; modifier: string }) => phrase({
			type: 'NP',
			tag: { relation },
			contents: [
				word({ stem: adposition, part_of_speech: 'Adposition', tag: { relation } }),
				word({ stem: modifier, part_of_speech: 'Noun', tag: { relation } }),
			],
		})
		const saxon_np = () => relation_np({ relation: 'genitive_saxon', adposition: '-Kinship', modifier: 'John' })
		const norman_np = () => phrase({ type: 'NP', tag: { relation: 'genitive_norman' }, contents: [word({ stem: '-Kinship', part_of_speech: 'Adposition', tag: { relation: 'genitive_norman' } }), noun('Mary')] })

		test.each([
			['genitive_saxon', '-Kinship', 'John', 'brother'],
			['pre_head_adjunct', '-Title', 'King', 'David'],
		])('places a %s NP directly after the noun it modifies', (relation, adposition, modifier, head) => {
			const tokens = order_main_clause(np({ role: 'patient', contents: [...relation_np({ relation, adposition, modifier }), noun(head)] }))

			expect(stems(tokens)).toEqual([head, adposition, modifier])
		})

		test('places a pre_head_of NP directly after the noun it modifies', () => {
			const group_np = phrase({ type: 'NP', tag: { relation: 'pre_head_of' }, contents: [noun('group'), word({ stem: '-Group', part_of_speech: 'Adposition', tag: { relation: 'group' } })] })
			const tokens = order_main_clause(np({ role: 'patient', contents: [...group_np, noun('people')] }))

			expect(stems(tokens)).toEqual(['people', '-Group', 'group'])
		})

		test('leaves the other modifiers in front of the noun', () => {
			const adjective = phrase({ type: 'AdjP', contents: [word({ stem: 'big', part_of_speech: 'Adjective' })] })
			const tokens = order_main_clause(np({ role: 'patient', contents: [...adjective, ...saxon_np(), noun('brother')] }))

			expect(stems(tokens)).toEqual(['big', 'brother', '-Kinship', 'John'])
		})

		test('places the relation NP directly after the noun, before the NPs already after it', () => {
			const tokens = order_main_clause(np({ role: 'patient', contents: [...saxon_np(), noun('brother'), ...norman_np()] }))

			expect(stems(tokens)).toEqual(['brother', '-Kinship', 'John', '-Kinship', 'Mary'])
		})

		test('does not move a genitive_norman NP', () => {
			const sub_tokens = np({ role: 'patient', contents: [...norman_np(), noun('brother')] })

			expect(order_main_clause(sub_tokens)).toEqual(sub_tokens)
		})

		test('does not move an NP because of a relation NP nested inside it', () => {
			const outer_np = phrase({ type: 'NP', tag: { relation: 'genitive_norman' }, contents: [word({ stem: '-Region', part_of_speech: 'Adposition', tag: { relation: 'genitive_norman' } }), ...saxon_np(), noun('house')] })
			const tokens = order_main_clause(np({ role: 'patient', contents: [...outer_np, noun('king')] }))

			expect(stems(tokens)).toEqual(['-Region', 'house', '-Kinship', 'John', 'king'])
		})

		test('orders NPs nested inside other phrases', () => {
			const inner_np = np({ contents: [...saxon_np(), noun('book')] })
			const tokens = order_main_clause(phrase({ type: 'AdjP', contents: [word({ stem: 'kind', part_of_speech: 'Adjective' }), ...inner_np] }))

			expect(stems(tokens)).toEqual(['kind', 'book', '-Kinship', 'John'])
		})

		test('places an adposition at the front of the NP', () => {
			const to_word = word({ stem: 'to', part_of_speech: 'Adposition' })
			const tokens = order_main_clause(np({ role: 'destination', contents: [noun('house'), to_word] }))

			expect(stems(tokens)).toEqual(['to', 'house'])
		})

		test('places a conjunction in front of the adposition at the front of the NP', () => {
			const to_word = word({ stem: 'to', part_of_speech: 'Adposition' })
			const and_word = word({ stem: 'and', part_of_speech: 'Conjunction' })
			const tokens = order_main_clause(np({ role: 'destination', contents: [noun('house'), to_word, and_word] }))

			expect(stems(tokens)).toEqual(['and', 'to', 'house'])
		})

		test('places a conjunction at the front of the NP when there is no adposition', () => {
			const and_word = word({ stem: 'and', part_of_speech: 'Conjunction' })
			const tokens = order_main_clause(np({ role: 'agent', contents: [noun('John'), and_word] }))

			expect(stems(tokens)).toEqual(['and', 'John'])
		})

		test('leaves NPs where they are when the NP has no head noun', () => {
			const sub_tokens = np({ contents: [...np({ contents: [noun('John')] }), ...np({ contents: [noun('Mary')] })] })

			expect(order_main_clause(sub_tokens)).toEqual(sub_tokens)
		})
	})

	test('leaves a clause without a verb unchanged', () => {
		const sub_tokens = [...np({ role: 'patient', contents: [noun('letter')] }), ...np({ role: 'agent', contents: [noun('Paul')] })]

		expect(order_main_clause(sub_tokens)).toEqual(sub_tokens)
	})
})
