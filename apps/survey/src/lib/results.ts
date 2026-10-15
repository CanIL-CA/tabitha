import type { SurveyRubric } from '@tabitha/types/survey'
import type { ReviewResponse, Side } from './types'

export type ResultsItem = {
	key: string
	title: string
	chips: string[]
	/** True when A showed the definition's second output. */
	swapped: boolean
	results_notes: string[]
}

export type NamedResponse = ReviewResponse & { reviewer_id: string, reviewer_name: string }

/** A count per issue label, for one of the definition's two outputs. */
export type IssueCount = { label: string, count: number }

export type ItemTally = {
	key: string
	title: string
	chips: string[]
	/** The side the definition's second output showed on. */
	second_shown_as: 'A' | 'B'
	/** Each answer's lean toward the second output: positive prefers it, negative prefers the first. */
	leans: number[]
	issues: [IssueCount[], IssueCount[]]
	comments: { reviewer_name: string, comment: string }[]
	results_notes: string[]
}

export type Tally = {
	reviewers: { name: string, answered: number }[]
	answers: number
	prefer_second: number
	clearly_second: number
	no_preference: number
	prefer_first: number
	clearly_first: number
	/** From -reach (always the first output) to +reach (always the second). */
	mean_lean: number
	reach: number
	items: ItemTally[]
}

/** Unblinds every answer: a lean toward A becomes a lean toward whichever output A showed. */
export function tally({ rubric, items, responses }: {
	rubric: SurveyRubric
	items: ResultsItem[]
	responses: NamedResponse[]
}): Tally {
	const reach = (rubric.scale.length - 1) / 2
	const answered = responses.filter(response => response.preference !== null)
	const swapped_by_key = new Map(items.map(item => [item.key, item.swapped]))
	const lean_toward_second = (response: NamedResponse) => (swapped_by_key.get(response.item_key) ? 1 : -1) * (response.preference ?? 0)
	const leans = answered.map(lean_toward_second)

	const reviewers = new Map<string, { name: string, answered: number }>()
	for (const { reviewer_id, reviewer_name } of answered) {
		const reviewer = reviewers.get(reviewer_id) ?? { name: reviewer_name, answered: 0 }
		reviewers.set(reviewer_id, { ...reviewer, answered: reviewer.answered + 1 })
	}

	return {
		reviewers: [...reviewers.values()],
		answers: leans.length,
		prefer_second: leans.filter(lean => lean > 0).length,
		clearly_second: leans.filter(lean => lean === reach).length,
		no_preference: leans.filter(lean => lean === 0).length,
		prefer_first: leans.filter(lean => lean < 0).length,
		clearly_first: leans.filter(lean => lean === -reach).length,
		mean_lean: leans.length ? leans.reduce((sum, lean) => sum + lean, 0) / leans.length : 0,
		reach,
		items: items.map(item => {
			const for_item = responses.filter(response => response.item_key === item.key)
			// The first output showed as B when swapped.
			const [first_side, second_side]: [Side, Side] = item.swapped ? ['b', 'a'] : ['a', 'b']
			return {
				key: item.key,
				title: item.title,
				chips: item.chips,
				second_shown_as: item.swapped ? 'A' : 'B',
				leans: for_item.filter(response => response.preference !== null).map(lean_toward_second),
				issues: [count_issues({ rubric, responses: for_item, side: first_side }), count_issues({ rubric, responses: for_item, side: second_side })],
				comments: for_item.filter(response => response.comment.trim()).map(({ reviewer_name, comment }) => ({ reviewer_name, comment })),
				results_notes: item.results_notes,
			}
		}),
	}
}

function count_issues({ rubric, responses, side }: {
	rubric: SurveyRubric
	responses: NamedResponse[]
	side: Side
}): IssueCount[] {
	return rubric.issues
		.map(issue => ({ label: issue.label, count: responses.filter(response => response.issues[side].includes(issue.key)).length }))
		.filter(({ count }) => count > 0)
}
