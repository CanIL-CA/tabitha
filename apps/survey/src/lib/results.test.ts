import type { SurveyRubric } from '@tabitha/types/survey'
import { describe, expect, it } from 'vitest'
import { tally, type NamedResponse, type ResultsItem } from './results'

const rubric: SurveyRubric = {
	question: 'Which is better?',
	scale: ['A ≫', 'A >', '≈', '< B', '≪ B'].map(short => ({ label: short, short })),
	issues: [{ key: 'meaning', label: 'Wrong meaning' }, { key: 'noise', label: 'Padding' }],
	comment_placeholder: '',
}

// john-3-16 showed the second output as A; genesis-1-1 showed it as B.
const items: ResultsItem[] = [
	{ key: 'john-3-16', title: 'John 3:16', chips: [], swapped: true, results_notes: [] },
	{ key: 'genesis-1-1', title: 'Genesis 1:1', chips: [], swapped: false, results_notes: ['tnn notes: 2 → 1'] },
]

function response(overrides: Partial<NamedResponse> & Pick<NamedResponse, 'item_key' | 'preference'>): NamedResponse {
	return { reviewer_id: 'r1', reviewer_name: 'Mikayla', issues: { a: [], b: [] }, comment: '', ...overrides }
}

describe('tally', () => {
	it('turns a lean toward A into a lean toward whichever output A showed', () => {
		const result = tally({
			rubric,
			items,
			responses: [
				response({ item_key: 'john-3-16', preference: 2 }),
				response({ item_key: 'genesis-1-1', preference: 1 }),
			],
		})

		expect(result.items.map(row => row.leans)).toEqual([[2], [-1]])
		expect(result).toMatchObject({ answers: 2, prefer_second: 1, clearly_second: 1, prefer_first: 1, clearly_first: 0, no_preference: 0, mean_lean: 0.5 })
	})

	it('counts ticked problems against the output they were about, not the side', () => {
		const result = tally({
			rubric,
			items,
			responses: [response({ item_key: 'john-3-16', preference: 0, issues: { a: ['noise'], b: ['meaning'] } })],
		})

		const [first_issues, second_issues] = result.items[0].issues
		expect(first_issues).toEqual([{ label: 'Wrong meaning', count: 1 }])
		expect(second_issues).toEqual([{ label: 'Padding', count: 1 }])
	})

	it('keeps comments and ticked problems from answers without a preference, but leaves them out of the leans', () => {
		const result = tally({
			rubric,
			items,
			responses: [response({ item_key: 'genesis-1-1', preference: null, comment: "Can't judge this one.", issues: { a: ['meaning'], b: [] } })],
		})

		expect(result.answers).toBe(0)
		expect(result.items[1]).toMatchObject({ leans: [], comments: [{ reviewer_name: 'Mikayla', comment: "Can't judge this one." }], issues: [[{ label: 'Wrong meaning', count: 1 }], []] })
	})

	it('counts reviewers by id, so two reviewers with the same name stay separate', () => {
		const result = tally({
			rubric,
			items,
			responses: [
				response({ item_key: 'john-3-16', preference: 1, reviewer_id: 'r1' }),
				response({ item_key: 'genesis-1-1', preference: 1, reviewer_id: 'r1' }),
				response({ item_key: 'john-3-16', preference: -1, reviewer_id: 'r2' }),
			],
		})

		expect(result.reviewers).toEqual([{ name: 'Mikayla', answered: 2 }, { name: 'Mikayla', answered: 1 }])
	})

	it('reports a zero mean with no answers', () => {
		expect(tally({ rubric, items, responses: [] })).toMatchObject({ answers: 0, mean_lean: 0, reach: 2 })
	})
})
