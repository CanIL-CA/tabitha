import { describe, expect, it } from 'vitest'
import { theta_grid_arguments } from '#lib/lookups.js'
import {
	ARGUMENT_CLAUSE_SOURCE_VALUES,
	BOUNDARY_CATEGORIES,
	closing_bracket_by_opening,
	curated_example_format,
	decode_token,
	fallback_code_by_category,
	find_theta_argument,
	get_coded_feature_label,
	head_phrase_by_part_of_speech,
	is_boundary_end,
	is_boundary_start,
	make_boundary_end,
	make_boundary_start,
	make_participant_feature,
	make_word,
	read_source_features,
	start_token_by_category,
	is_duplicate_example,
	put_example,
	split_example_lines,
} from './format.js'

describe('the curated example format', () => {
	const features = Object.values(curated_example_format).flatMap(part => Object.values(part.features ?? {}))

	it('has no start token that another start token starts with, since a token is recognized by how it starts', () => {
		const tokens = Object.values(start_token_by_category)
		for (const token of tokens) {
			expect(tokens.filter(other => other !== token && other.startsWith(token)), token).toEqual([])
		}
	})

	it('has start tokens that begin with the bracket of the kind of part', () => {
		for (const [name, token] of Object.entries(start_token_by_category)) {
			expect(token[0] in closing_bracket_by_opening, name).toBe(true)
		}
	})

	it('has at most one coded feature for a part, whose codes are single characters', () => {
		for (const [name, part] of Object.entries(curated_example_format)) {
			const coded_features = Object.values(part.features ?? {}).filter(({ coded }) => coded)
			expect(coded_features.length, name).toBeLessThanOrEqual(1)
			for (const code of Object.keys(coded_features[0]?.values ?? {})) expect(code, name).toHaveLength(1)
		}
	})

	it('names only theta grid arguments that exist', () => {
		const argument_names = features.flatMap(({ values }) => Object.values(values).flatMap(({ label, theta_argument }) => theta_argument === true ? [label] : theta_argument ? [theta_argument] : []))
		expect(argument_names.length).toBeGreaterThan(0)
		for (const name of argument_names) expect(theta_grid_arguments, name).toContain(name)
	})

	it('has no feature that is both coded and computed', () => {
		for (const { name, coded, computed } of features) expect(coded && computed, name).toBeFalsy()
	})

	it('works out the start token and fallback code of each phrase and clause', () => {
		expect(start_token_by_category).toEqual({ 'Noun Phrase': '(NP', 'Verb Phrase': '(VP', 'Adjective Phrase': '(AP', 'Adverb Phrase': '(aP', 'Clause': '[' })
		expect(fallback_code_by_category).toEqual({ 'Noun Phrase': 'N' })
		expect([...BOUNDARY_CATEGORIES]).toEqual(['Noun Phrase', 'Verb Phrase', 'Adjective Phrase', 'Adverb Phrase', 'Clause'])
	})

	it('works out the brackets', () => {
		expect(closing_bracket_by_opening).toEqual({ '(': ')', '[': ']' })
		expect(['(', '[', ')', ']', 'baby'].map(value => [is_boundary_start({ value }), is_boundary_end({ value })])).toEqual([[true, false], [true, false], [false, true], [false, true], [false, false]])
	})

	it('works out the phrase that each part of speech heads, and the argument clause types a source entity can have', () => {
		expect(head_phrase_by_part_of_speech).toEqual({ Noun: 'Noun Phrase', Verb: 'Verb Phrase', Adjective: 'Adjective Phrase', Adverb: 'Adverb Phrase' })
		expect([...ARGUMENT_CLAUSE_SOURCE_VALUES]).toEqual(['Agent (Subject Complement)', 'Patient (Object Complement)', 'Attributive Patient (Adjectival Object Complement)'])
	})
})

describe('decode_token', () => {
	it('reads a phrase or clause start, with the code that follows the token', () => {
		expect(decode_token('(NPA')).toEqual({ category: 'Noun Phrase', category_abbr: 'NP', value: '(', feature_codes: 'A', features: [{ name: 'Semantic Role', value: 'Most Agent-like' }] })
		expect(decode_token('(APP')).toEqual({ category: 'Adjective Phrase', category_abbr: 'AdjP', value: '(', feature_codes: 'P', features: [{ name: 'Usage', value: 'Predicative' }] })
		expect(decode_token('[p')).toEqual({ category: 'Clause', category_abbr: 'Prop', value: '[', feature_codes: 'p', features: [{ name: 'Type', value: 'Attributive Patient (Adjectival Object Complement)' }] })
	})

	it('keeps a code that it does not know, without a feature', () => {
		expect(decode_token('(NPN')).toMatchObject({ category: 'Noun Phrase', feature_codes: 'N', features: [] })
		expect(decode_token('(NP')).toMatchObject({ category: 'Noun Phrase', feature_codes: '', features: [] })
	})

	it('reads a part with no coded feature, without taking the end of its token for a code', () => {
		expect(decode_token('(VP')).toEqual({ category: 'Verb Phrase', category_abbr: 'VP', value: '(', feature_codes: '', features: [] })
		expect(decode_token('(aP')).toMatchObject({ category: 'Adverb Phrase', feature_codes: '' })
	})

	it('reads the end of a phrase or clause, and a word', () => {
		expect(decode_token(')')).toEqual({ category: '', category_abbr: '', value: ')', feature_codes: '', features: [] })
		expect(decode_token(']')).toMatchObject({ value: ']' })
		expect(decode_token('baby')).toEqual({ category: '', category_abbr: '', value: 'baby', feature_codes: '', features: [] })
	})
})

describe('find_theta_argument', () => {
	it('is the theta grid argument that a noun phrase or clause with a code is', () => {
		expect(find_theta_argument({ category: 'Noun Phrase', code: 'A' })).toBe('Agent-like')
		expect(find_theta_argument({ category: 'Noun Phrase', code: 'd' })).toBe('Destination')
		expect(find_theta_argument({ category: 'Clause', code: 'P' })).toBe('Patient proposition')
	})

	it('is nothing for what is not an argument of a verb', () => {
		expect(find_theta_argument({ category: 'Noun Phrase', code: 'D' })).toBeUndefined()
		expect(find_theta_argument({ category: 'Clause', code: 'p' })).toBeUndefined()
		expect(find_theta_argument({ category: 'Adjective Phrase', code: 'A' })).toBeUndefined()
	})
})

describe('read_source_features', () => {
	it('reads the coded feature of a phrase from the value its source entity has, with its code', () => {
		const source_features = [{ name: 'Sequence', value: 'Coordinate' }, { name: 'Semantic Role', value: 'Most Agent-like' }]
		expect(read_source_features({ part_name: 'Noun Phrase', source_category: 'Noun Phrase', source_features }))
			.toEqual({ features: [{ name: 'Semantic Role', value: 'Most Agent-like' }], feature_code: 'A' })
	})

	it('reads nothing for a value that the format has no code for', () => {
		expect(read_source_features({ part_name: 'Noun Phrase', source_category: 'Noun Phrase', source_features: [{ name: 'Semantic Role', value: 'Not Applicable' }] }))
			.toEqual({ features: [], feature_code: '' })
	})

	it('reads the degree of an adjective, which has no code, and only when it is one that matters', () => {
		const comparative = [{ name: 'Degree', value: 'Comparative' }]
		expect(read_source_features({ part_name: 'Word', source_category: 'Adjective', source_features: comparative })).toEqual({ features: comparative, feature_code: '' })
		expect(read_source_features({ part_name: 'Word', source_category: 'Adjective', source_features: [{ name: 'Degree', value: 'No Degree' }] }).features).toEqual([])
		expect(read_source_features({ part_name: 'Word', source_category: 'Adverb', source_features: comparative }).features).toEqual([])
	})

	it('does not read a feature that is worked out', () => {
		expect(read_source_features({ part_name: 'Clause', source_category: 'Clause', source_features: [{ name: 'Participant', value: 'Same' }] }).features).toEqual([])
	})
})

describe('making entities', () => {
	it('makes the start of a phrase or clause with the bracket of its kind', () => {
		expect(make_boundary_start({ part_name: 'Noun Phrase', feature_code: 'A', features: [] })).toMatchObject({ category: 'Noun Phrase', category_abbr: 'NP', value: '(', feature_codes: 'A' })
		expect(make_boundary_start({ part_name: 'Clause', feature_code: '', features: [] })).toMatchObject({ category: 'Clause', category_abbr: 'Prop', value: '[' })
	})

	it('makes the end that closes a start', () => {
		expect(make_boundary_end(make_boundary_start({ part_name: 'Verb Phrase', feature_code: '', features: [] }))).toMatchObject({ category: '', value: ')' })
		expect(make_boundary_end(make_boundary_start({ part_name: 'Clause', feature_code: '', features: [] }))).toMatchObject({ value: ']' })
	})

	it('makes a word', () => {
		expect(make_word({ category: 'Noun', value: 'baby', features: [] })).toEqual({ category: 'Noun', category_abbr: '', value: 'baby', feature_codes: '', features: [] })
	})
})

describe('get_coded_feature_label', () => {
	it('is what the coded feature of a phrase or clause shows as', () => {
		expect(get_coded_feature_label(decode_token('(NPA'))).toBe('Agent')
		expect(get_coded_feature_label(decode_token('(APP'))).toBe('Predicative')
		expect(get_coded_feature_label(decode_token('[p'))).toBe('Patient')
	})

	it('is nothing without a coded feature', () => {
		expect(get_coded_feature_label(decode_token('(NPN'))).toBeUndefined()
		expect(get_coded_feature_label(decode_token('(VP'))).toBeUndefined()
		expect(get_coded_feature_label(decode_token('baby'))).toBeUndefined()
	})
})

describe('the features that are worked out', () => {
	it('makes the participant feature and recognizes it', () => {
		const same = make_participant_feature('same')
		const different = make_participant_feature('different')

		expect(same).toEqual({ name: 'Participant', value: 'Same' })
		expect(different).toEqual({ name: 'Participant', value: 'Different' })
	})
})

const FIRST = '4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.'
const SECOND = '4,17,2,2|(NPA|Xerxes|)|(VP|search|)|~Xerxes searched.'
const NEW = '6,8,1,67|(NPA|John|)|(VP|go|)|~John went.'

describe('split_example_lines', () => {
	it('has a line for each example, whatever ends the lines, and none for blank lines', () => {
		expect(split_example_lines(`${FIRST}\r\n\n${SECOND}\n`)).toEqual([FIRST, SECOND])
		expect(split_example_lines('')).toEqual([])
	})
})

describe('put_example', () => {
	const curated_examples = `${FIRST}\n${SECOND}\n`

	it('adds the example after the others, with a line ending', () => {
		expect(put_example({ curated_examples, encoded_example: NEW, replaces: null })).toBe(`${FIRST}\n${SECOND}\n${NEW}\n`)
		expect(put_example({ curated_examples: '', encoded_example: NEW, replaces: null })).toBe(`${NEW}\n`)
	})

	it('puts the example in the place of the one it replaces', () => {
		expect(put_example({ curated_examples, encoded_example: NEW, replaces: 0 })).toBe(`${NEW}\n${SECOND}\n`)
		expect(put_example({ curated_examples, encoded_example: NEW, replaces: 1 })).toBe(`${FIRST}\n${NEW}\n`)
	})

	it('adds the example when there is no example to replace', () => {
		expect(put_example({ curated_examples, encoded_example: NEW, replaces: 5 })).toBe(`${FIRST}\n${SECOND}\n${NEW}\n`)
	})
})

describe('is_duplicate_example', () => {
	const curated_examples = `${FIRST}\n${SECOND}\n`

	it('is whether the concept already has the example', () => {
		expect(is_duplicate_example({ curated_examples, encoded_example: SECOND, replaces: null })).toBe(true)
		expect(is_duplicate_example({ curated_examples, encoded_example: NEW, replaces: null })).toBe(false)
	})

	it('does not count the example that is being replaced', () => {
		expect(is_duplicate_example({ curated_examples, encoded_example: FIRST, replaces: 0 })).toBe(false)
		expect(is_duplicate_example({ curated_examples, encoded_example: FIRST, replaces: 1 })).toBe(true)
	})
})

