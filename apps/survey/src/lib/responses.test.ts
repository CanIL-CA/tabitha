import type { SurveyRubric } from '@tabitha/types/survey'
import { describe, expect, it } from 'vitest'
import { MAX_COMMENT_LENGTH, MAX_NAME_LENGTH, parse_name, parse_response, preference_at, resume_index } from './responses'

const rubric: SurveyRubric = {
	question: 'Which is better?',
	scale: ['A ≫', 'A >', '≈', '< B', '≪ B'].map(short => ({ label: short, short })),
	issues: [{ key: 'meaning', label: 'Wrong meaning' }, { key: 'noise', label: 'Padding' }],
	comment_placeholder: '',
}
const item_keys = new Set(['john-3-16'])

const body = (overrides: Record<string, unknown> = {}) => ({ item_key: 'john-3-16', preference: 1, issues: { a: ['meaning'], b: [] }, comment: 'B misreads the quote.', ...overrides })

describe('preference_at', () => {
	it('runs from the furthest lean toward A down to the furthest toward B', () => {
		expect(rubric.scale.map((_choice, index) => preference_at({ rubric, index }))).toEqual([2, 1, 0, -1, -2])
	})
})

describe('parse_response', () => {
	it('accepts a complete answer', () => {
		expect(parse_response({ body: body(), rubric, item_keys })).toEqual({
			response: { item_key: 'john-3-16', preference: 1, issues: { a: ['meaning'], b: [] }, comment: 'B misreads the quote.' },
		})
	})

	it('accepts a comment or ticked issue before a preference is picked', () => {
		expect(parse_response({ body: body({ preference: null }), rubric, item_keys })).toMatchObject({ response: { preference: null } })
	})

	it('drops unknown and repeated issue keys rather than refusing the answer', () => {
		const parsed = parse_response({ body: body({ issues: { a: ['noise', 'retired-key', 'noise', 7], b: 'not a list' } }), rubric, item_keys })

		expect(parsed).toMatchObject({ response: { issues: { a: ['noise'], b: [] } } })
	})

	it.each([
		['an unknown item', body({ item_key: 'acts-1-8' }), /Unknown item/],
		['a preference past the scale', body({ preference: 3 }), /outside the scale/],
		['a fractional preference', body({ preference: 0.5 }), /outside the scale/],
		['an overlong comment', body({ comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }), /Comment must be/],
		["a body that isn't an object", 'john-3-16', /Expected a JSON object/],
	])('refuses %s', (_name, request_body, expected) => {
		expect(parse_response({ body: request_body, rubric, item_keys })).toEqual({ problem: expect.stringMatching(expected) })
	})
})

describe('parse_name', () => {
	it('trims the name', () => {
		expect(parse_name({ name: '  Mikayla ' })).toEqual({ name: 'Mikayla' })
	})

	it.each([
		['a blank name', { name: '   ' }],
		['a missing name', {}],
		['an overlong name', { name: 'x'.repeat(MAX_NAME_LENGTH + 1) }],
	])('refuses %s', (_name, request_body) => {
		expect(parse_name(request_body)).toHaveProperty('problem')
	})
})

describe('resume_index', () => {
	const answer = ({ item_key, preference }: { item_key: string, preference: number | null }) => ({ item_key, preference, issues: { a: [], b: [] }, comment: '' })

	it('picks up at the first item without a preference', () => {
		const responses = { 'genesis-1-1': answer({ item_key: 'genesis-1-1', preference: 0 }), 'ruth-1-16': answer({ item_key: 'ruth-1-16', preference: null }) }

		expect(resume_index({ item_keys: ['genesis-1-1', 'ruth-1-16', 'john-3-16'], responses })).toBe(1)
	})

	it('starts at the first item once everything is answered', () => {
		expect(resume_index({ item_keys: ['genesis-1-1'], responses: { 'genesis-1-1': answer({ item_key: 'genesis-1-1', preference: -2 }) } })).toBe(0)
	})
})
