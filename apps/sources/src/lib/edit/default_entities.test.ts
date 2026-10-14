import { describe, expect, it } from 'vitest'
import { WORD_ENTITY_CATEGORIES } from '#lib/encoding/lookups.js'
import { DEFAULTS } from './default_entities'

const entries = Object.entries(DEFAULTS)
const word_entries = entries.filter(([, entity]) => WORD_ENTITY_CATEGORIES.has(entity.category))
const non_word_entries = entries.filter(([, entity]) => !WORD_ENTITY_CATEGORIES.has(entity.category))
const subordinate_clause_entries = entries.filter(([name]) => name.startsWith('CLAUSE_') && name !== 'CLAUSE_MAIN')

describe('DEFAULTS', () => {
	it.each(entries)('%s starts unplaced in the tree', (_name, entity) => {
		expect(entity.id).toBe(-1)
		expect(entity.parent_id).toBe(-1)
	})

	it.each(word_entries)('%s is a word with an empty concept of its own part of speech', (_name, entity) => {
		expect(entity.concept).toEqual({ stem: '', sense: '', part_of_speech: entity.category })
	})

	it.each(non_word_entries)('%s is not a word, so has no concept', (_name, entity) => {
		expect(entity.concept).toBeNull()
		expect(entity.pairing_concept).toBeNull()
	})

	it('opens the main clause with "{" and every subordinate clause with "["', () => {
		expect(DEFAULTS.CLAUSE_MAIN.value).toBe('{')
		expect(subordinate_clause_entries.map(([, clause]) => clause.value)).toEqual(subordinate_clause_entries.map(() => '['))
	})

	it('gives each specific subordinate clause its own Type feature', () => {
		const types = subordinate_clause_entries
			.filter(([name]) => name !== 'CLAUSE_SUBORDINATE')
			.map(([, clause]) => clause.features.find(({ name }) => name === 'Type')?.value)

		expect(types.every(Boolean)).toBe(true)
		expect(new Set(types).size).toBe(types.length)
	})

	it('opens every phrase with "("', () => {
		const phrases = entries.filter(([name]) => name.endsWith('_PHRASE') || name.startsWith('ADJECTIVE_PHRASE'))

		expect(phrases.map(([, phrase]) => phrase.value)).toEqual(phrases.map(() => '('))
	})
})
