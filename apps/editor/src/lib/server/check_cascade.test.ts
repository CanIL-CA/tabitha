import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { expand_token, run_check } from './check'
import type { CheckerMessageLabel, CheckerToken, OntologyResult, PartOfSpeech, TargetFormResult } from '@tabitha/types'

type Concept = { sense: string; part_of_speech: PartOfSpeech; level: number; categorization: string }

// Only the senses these sentences need, with just the fields the checker reads
const ONTOLOGY: Record<string, Concept[]> = {
	be: [
		{ sense: 'A', part_of_speech: 'Verb', level: 1, categorization: 'A______H_' },
		{ sense: 'F', part_of_speech: 'Verb', level: 0, categorization: 'A_cd_____' },
	],
	clothes: [{ sense: 'A', part_of_speech: 'Noun', level: 1, categorization: 'o' }],
	edge: [{ sense: 'A', part_of_speech: 'Noun', level: 1, categorization: 'o' }],
	go: [
		{ sense: 'A', part_of_speech: 'Verb', level: 1, categorization: 'A__de_g__' },
		{ sense: 'B', part_of_speech: 'Verb', level: 1, categorization: 'A__dE____' },
	],
	in: [{ sense: 'A', part_of_speech: 'Adposition', level: 1, categorization: 'A__' }],
	into: [{ sense: 'A', part_of_speech: 'Adposition', level: 1, categorization: 'A__' }],
	jesus: [{ sense: 'A', part_of_speech: 'Noun', level: 4, categorization: 'M' }],
	john: [{ sense: 'A', part_of_speech: 'Noun', level: 4, categorization: 'M' }],
	let: [{ sense: 'A', part_of_speech: 'Verb', level: 1, categorization: 'A______H_' }],
	man: [{ sense: 'A', part_of_speech: 'Noun', level: 1, categorization: 'o' }],
	near: [{ sense: 'A', part_of_speech: 'Adposition', level: 1, categorization: 'A__' }],
	person: [{ sense: 'A', part_of_speech: 'Noun', level: 0, categorization: 'o' }],
	place: [{ sense: 'A', part_of_speech: 'Noun', level: 0, categorization: 'o' }],
	priest: [{ sense: 'A', part_of_speech: 'Noun', level: 1, categorization: 'o' }],
	river: [{ sense: 'A', part_of_speech: 'Noun', level: 1, categorization: 'o' }],
	sick: [{ sense: 'A', part_of_speech: 'Adjective', level: 1, categorization: 'Gab____' }],
	stand: [{ sense: 'A', part_of_speech: 'Verb', level: 1, categorization: 'A________' }],
	touch: [{ sense: 'A', part_of_speech: 'Verb', level: 1, categorization: 'AB___f___' }],
	where: [{ sense: 'A', part_of_speech: 'Adverb', level: 1, categorization: '' }],
}

// Inflected words only; any other word is looked up in the Ontology as written
const FORMS: Record<string, Pick<TargetFormResult, 'stem' | 'part_of_speech' | 'form'>> = {
	people: { stem: 'person', part_of_speech: 'Noun', form: 'Plural' },
	priests: { stem: 'priest', part_of_speech: 'Noun', form: 'Plural' },
	standing: { stem: 'stand', part_of_speech: 'Verb', form: 'Participle' },
	was: { stem: 'be', part_of_speech: 'Verb', form: 'Past' },
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

function messages_on({ tokens, token }: { tokens: CheckerToken[]; token: string }): { label: CheckerMessageLabel; message: string }[] {
	return tokens
		.flatMap(expand_token)
		.filter(candidate => candidate.token === token)
		.flatMap(({ messages }) => messages.map(({ label, message }) => ({ label, message })))
}

function labels_on({ tokens, token }: { tokens: CheckerToken[]; token: string }): CheckerMessageLabel[] {
	return messages_on({ tokens, token }).map(({ label }) => label)
}

describe("'where' used as a relativizer", () => {
	const text = 'The man went into the river near the place [where the priests are standing].'

	test('keeps the relativizer error as the only error', async () => {
		const { status, tokens } = await run_check(text)

		expect(status).toBe('error')
		expect(labels_on({ tokens, token: 'where' })).toContain('error')
		expect(labels_on({ tokens, token: 'went' })).not.toContain('error')
		expect(labels_on({ tokens, token: '[' })).not.toContain('error')
	})

	test('points the verb warnings at the relativizer, before the warnings themselves', async () => {
		const { tokens } = await run_check(text)

		expect(messages_on({ tokens, token: 'went' })[0]).toEqual({
			label: 'warning',
			message: "This may be caused by 'where' used as a relativizer. Fix that first.",
		})
	})

	test('adds no hint to a verb the relativizer does not break', async () => {
		const { tokens } = await run_check('John was near the place [where the priests are standing].')

		expect(messages_on({ tokens, token: 'was' })).toEqual([])
	})

	test('the corrected encoding checks clean', async () => {
		const { status } = await run_check('The man went into the river near the place [that the priests are standing in].')

		expect(status).toBe('ok')
	})
})

describe('unbracketed clause after a verb that takes a patient clause', () => {
	const text = "Jesus let those sick people touch the edge of Jesus's clothes."

	test('reports the missing bracket on the verb instead of a generic usage error', async () => {
		const { tokens } = await run_check(text)
		const let_messages = messages_on({ tokens, token: 'let' })

		expect(let_messages).toContainEqual({
			label: 'error',
			message: "Put brackets around the clause after 'let', e.g. 'let [X do Y]'.",
		})
		expect(let_messages.map(({ message }) => message)).not.toContainEqual(expect.stringMatching(/^Incorrect usage of/))
	})

	test('downgrades the unexpected patient to a warning', async () => {
		const { tokens } = await run_check(text)

		expect(labels_on({ tokens, token: 'people' })).toEqual(['warning'])
	})

	test('keeps the multiple-verbs error on the second verb', async () => {
		const { tokens } = await run_check(text)

		expect(labels_on({ tokens, token: 'touch' })).toContain('error')
	})

	test('the corrected encoding checks clean', async () => {
		const { status } = await run_check("Jesus let [those sick people touch the edge of Jesus's clothes].")

		expect(status).toBe('ok')
	})
})
