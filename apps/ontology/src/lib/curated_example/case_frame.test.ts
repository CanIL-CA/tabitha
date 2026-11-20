import { describe, expect, it } from 'vitest'
import { transform_curated_examples } from '#lib/transformers.js'
import { compare_case_frame, find_present_slots, get_slot_labels, suggest_categories } from './case_frame.js'
import type { CuratedExampleEncoding } from '#lib/types.js'
import type { PartOfSpeech } from '@tabitha/types'

const decode = (encoded_entities: string): CuratedExampleEncoding =>
	transform_curated_examples(`4,2,2,2|${encoded_entities}|~A sentence.`)[0].encoding

const THETA = { agent: 0, patient: 1, destination: 4, patient_proposition: 7, agent_proposition: 8 }
const ADJECTIVE = { attributive: 0, without_argument: 1, nominal_argument: 2, same_participant: 3, different_participant: 4, comparative: 5 }

describe('find_present_slots', () => {
	const verb_slots = ({ stem, encoded }: { stem: string; encoded: string }) => find_present_slots({ part_of_speech: 'Verb', stem, encoding: decode(encoded) })

	describe('for a verb', () => {
		it('is the arguments that are directly in the clause of the verb', () => {
			expect(verb_slots({ stem: 'give', encoded: '(NPA|John|)|(VP|give|)|(NPP|book|)|(NPd|Mary|)' })).toEqual([THETA.agent, THETA.patient, THETA.destination])
		})

		it('is each argument once, in the order of the theta grid', () => {
			expect(verb_slots({ stem: 'give', encoded: '(NPd|Mary|)|(NPP|book|)|(VP|give|)|(NPP|bread|)|(NPA|John|)' })).toEqual([THETA.agent, THETA.patient, THETA.destination])
		})

		it('does not count what is inside an argument, nor a noun phrase with no role', () => {
			expect(verb_slots({ stem: 'give', encoded: '(NPA|John|(NPP|friend|)|)|(VP|give|)|(NPN|book|)' })).toEqual([THETA.agent])
		})

		it('uses the clause the verb is in when that is an argument clause', () => {
			const encoded = '[A|(NPA|John|)|(VP|read|)|]|(VP|be|)'
			expect(verb_slots({ stem: 'read', encoded })).toEqual([THETA.agent])
			expect(verb_slots({ stem: 'be', encoded })).toEqual([THETA.agent_proposition])
		})

		it('recognizes a patient clause', () => {
			expect(verb_slots({ stem: 'know', encoded: '(NPA|John|)|(VP|know|)|[P|(NPA|Mary|)|(VP|go|)|]' })).toEqual([THETA.agent, THETA.patient_proposition])
		})

		it('is undefined when the verb is not in the example', () => {
			expect(verb_slots({ stem: 'go', encoded: '(NPA|John|)|(VP|give|)' })).toBeUndefined()
		})
	})

	describe('for an adjective', () => {
		const adjective_slots = (encoded: string) => find_present_slots({ part_of_speech: 'Adjective', stem: 'ready', encoding: decode(encoded) })

		it('is attributive in a noun phrase', () => {
			expect(adjective_slots('(NPP|(APA|ready|)|virgin|)')).toEqual([ADJECTIVE.attributive])
		})

		it('is predicative without an argument in the clause', () => {
			expect(adjective_slots('(NPA|John|)|(VP|be|)|(APP|ready|)')).toEqual([ADJECTIVE.without_argument])
		})

		it('is predicative with a nominal argument', () => {
			expect(adjective_slots('(NPA|John|)|(VP|be|)|(APP|ready|(NPP|book|)|)')).toEqual([ADJECTIVE.nominal_argument])
		})

		it('is predicative with a clause argument of the same or a different participant, when that is known', () => {
			const encoding = decode('(NPA|John|)|(VP|be|)|(APP|ready|[p|(NPA|John|)|(VP|read|)|]|)')
			const with_participant = (participant: string) => encoding.map(entity => entity.category === 'Clause' ? { ...entity, features: [...entity.features, { name: 'Participant', value: participant }] } : entity)
			const slots = (participant_encoding: CuratedExampleEncoding) => find_present_slots({ part_of_speech: 'Adjective', stem: 'ready', encoding: participant_encoding })

			expect(slots(with_participant('Same'))).toEqual([ADJECTIVE.same_participant])
			expect(slots(with_participant('Different'))).toEqual([ADJECTIVE.different_participant])
			expect(slots(encoding)).toEqual([])
		})

		it('is also comparative when its degree is comparative', () => {
			const encoding = decode('(NPA|John|)|(VP|be|)|(APP|ready|)').map(entity => entity.value === 'ready' ? { ...entity, features: [{ name: 'Degree', value: 'Comparative' }] } : entity)
			expect(find_present_slots({ part_of_speech: 'Adjective', stem: 'ready', encoding })).toEqual([ADJECTIVE.without_argument, ADJECTIVE.comparative])
		})

		it('has no usage in an adjective phrase within an adjective phrase', () => {
			expect(adjective_slots('(APP|good|(APA|ready|)|)')).toEqual([])
		})
	})

	describe('for an adposition, adverb or conjunction', () => {
		const slots = ({ part_of_speech, stem, encoded }: { part_of_speech: PartOfSpeech; stem: string; encoded: string }) =>
			find_present_slots({ part_of_speech, stem, encoding: decode(encoded) })

		it.each([
			['an adposition in a noun phrase in the clause', '(VP|go|)|(NPd|in|house|)', 'in', 0],
			['an adposition in a noun phrase in a noun phrase', '(NPA|clothes|(NPN|of|flower|)|)', 'of', 1],
			['an adposition directly in the clause', '(NPA|John|)|because|(VP|go|)', 'because', 2],
		])('knows %s', (_description, encoded, stem, slot) => {
			expect(slots({ part_of_speech: 'Adposition', stem, encoded })).toEqual([slot])
		})

		it.each([
			['the clause', '(VP|go|)|(aP|quickly|)', 0],
			['a noun phrase', '(NPA|(aP|quickly|)|man|)|(VP|go|)', 1],
			['an adjective phrase', '(APP|(aP|quickly|)|good|)', 2],
		])('knows an adverb that modifies %s', (_description, encoded, slot) => {
			expect(slots({ part_of_speech: 'Adverb', stem: 'quickly', encoded })).toEqual([slot])
		})

		it.each([
			['clauses', '(VP|go|)|and|(VP|stay|)', 0],
			['noun phrases', '(NPA|John|and|Mary|)|(VP|go|)', 1],
		])('knows a conjunction that conjoins %s', (_description, encoded, slot) => {
			expect(slots({ part_of_speech: 'Conjunction', stem: 'and', encoded })).toEqual([slot])
		})
	})

	it('is undefined for a part of speech that has no case frame', () => {
		expect(find_present_slots({ part_of_speech: 'Noun', stem: 'baby', encoding: decode('(NPA|baby|)') })).toBeUndefined()
	})
})

describe('get_slot_labels', () => {
	it('names the theta grid arguments and the usages', () => {
		expect(get_slot_labels('Verb')[THETA.destination]).toBe('Destination')
		expect(get_slot_labels('Adposition')).toEqual(['used in Adjunct Phrases', 'used in Noun-Noun Phrases', 'used in Abverbial Clauses'])
		expect(get_slot_labels('Noun')).toEqual([])
	})
})

describe('compare_case_frame and suggest_categories', () => {
	const grid = (categories: Record<number, string>) => Array.from({ length: 9 }, (_, i) => categories[i] ?? '')

	describe('for a verb', () => {
		const categories = grid({ 0: 'Agent-like', 1: 'Patient-like', 2: '(State)' })

		it('has a new slot for what the example shows that the concept does not use', () => {
			expect(compare_case_frame({ part_of_speech: 'Verb', categories, present_slots: [0, 1, THETA.destination] })).toEqual({ new_slots: [THETA.destination], absent_slots: [] })
		})

		it('has an absent slot for what the concept requires that the example does without, but not for what is optional', () => {
			expect(compare_case_frame({ part_of_speech: 'Verb', categories, present_slots: [0] })).toEqual({ new_slots: [], absent_slots: [1] })
		})

		it('suggests adding the new slot as optional, and making the absent one optional', () => {
			expect(suggest_categories({ part_of_speech: 'Verb', categories, present_slots: [0, THETA.destination] }))
				.toEqual(grid({ 0: 'Agent-like', 1: '(Patient-like)', 2: '(State)', 4: '(Destination)' }))
		})

		it('keeps the categories when the example shows nothing new', () => {
			expect(suggest_categories({ part_of_speech: 'Verb', categories, present_slots: [0, 1, 2] })).toEqual(categories)
		})

		it('puts the categories in the order of the theta grid, however they came', () => {
			expect(suggest_categories({ part_of_speech: 'Verb', categories: ['(Destination)', 'Agent-like'], present_slots: [0, 4] }))
				.toEqual(grid({ 0: 'Agent-like', 4: '(Destination)' }))
		})

		it('starts from nothing when the concept has no categories', () => {
			expect(suggest_categories({ part_of_speech: 'Verb', categories: [], present_slots: [0, 1] })).toEqual(grid({ 0: '(Agent-like)', 1: '(Patient-like)' }))
		})
	})

	describe('for a word with usages', () => {
		const adposition_categories = ['never used in Adjunct Phrases', 'always used in Noun-Noun Phrases', 'sometimes used in Abverbial Clauses']

		it('compares by how often the concept says each usage happens', () => {
			expect(compare_case_frame({ part_of_speech: 'Adposition', categories: adposition_categories, present_slots: [0, 2] })).toEqual({ new_slots: [0], absent_slots: [1] })
		})

		it('suggests the new usage as sometimes, and the absent one that is always as sometimes', () => {
			expect(suggest_categories({ part_of_speech: 'Adposition', categories: adposition_categories, present_slots: [0, 2] }))
				.toEqual(['sometimes used in Adjunct Phrases', 'sometimes used in Noun-Noun Phrases', 'sometimes used in Abverbial Clauses'])
		})

		it('keeps the semantic category of an adjective, and offsets its usages by one', () => {
			const categories = ['Color', 'never used attributively', 'sometimes used predicatively without an argument', 'never used predicatively with a nominal argument', 'never used predicatively with a same participant clausal argument', 'never used predicatively with a different participant clausal argument', 'never used comparatively']
			const suggestion = suggest_categories({ part_of_speech: 'Adjective', categories, present_slots: [ADJECTIVE.nominal_argument] })
			expect(suggestion[0]).toBe('Color')
			expect(suggestion[3]).toBe('sometimes used predicatively with a nominal argument')
			expect(suggestion[2]).toBe('sometimes used predicatively without an argument')
		})

		it('starts from never when the concept has no categories', () => {
			expect(suggest_categories({ part_of_speech: 'Conjunction', categories: [], present_slots: [1] })).toEqual([
				'never used to conjoin Clauses',
				'sometimes used to conjoin Noun Phrases',
				'never used to conjoin Adjective Phrases',
				'never used to conjoin Adverb Phrases',
			])
		})
	})
})
