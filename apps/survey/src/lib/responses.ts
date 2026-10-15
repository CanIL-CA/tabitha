import type { SurveyRubric } from '@tabitha/types/survey'
import type { ReviewResponse, Side } from './types'

export const MAX_COMMENT_LENGTH = 4000
export const MAX_NAME_LENGTH = 100

/** How far the scale reaches each way: a 5-choice scale runs from 2 (A) to -2 (B). */
export const scale_reach = (rubric: SurveyRubric) => (rubric.scale.length - 1) / 2

/** The preference a scale choice stands for: the first choice leans furthest toward A. */
export const preference_at = ({ rubric, index }: { rubric: SurveyRubric, index: number }) => scale_reach(rubric) - index

/** A saved response from an untrusted request body, or the reason it was refused. Unknown issue
 * keys are dropped rather than refused, so a stale page can't lose a reviewer's other answers. */
export function parse_response({ body, rubric, item_keys }: {
	body: unknown
	rubric: SurveyRubric
	item_keys: Set<string>
}): { response: ReviewResponse } | { problem: string } {
	if (!body || typeof body !== 'object') return { problem: 'Expected a JSON object' }
	const { item_key, preference, issues, comment } = body as Record<string, unknown>

	if (typeof item_key !== 'string' || !item_keys.has(item_key)) return { problem: 'Unknown item' }

	const reach = scale_reach(rubric)
	const valid_preference = preference === null || Number.isInteger(preference) && Math.abs(preference as number) <= reach
	if (!valid_preference) return { problem: 'Preference is outside the scale' }

	if (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH) return { problem: `Comment must be text of at most ${MAX_COMMENT_LENGTH} characters` }

	const issue_keys = new Set(rubric.issues.map(issue => issue.key))
	const ticked = (side: Side) => {
		const listed = (issues as Partial<Record<Side, unknown>> | undefined)?.[side]
		return Array.isArray(listed) ? [...new Set(listed.filter(key => typeof key === 'string' && issue_keys.has(key)))] as string[] : []
	}

	return { response: { item_key, preference: preference as number | null, issues: { a: ticked('a'), b: ticked('b') }, comment } }
}

export function parse_name(body: unknown): { name: string } | { problem: string } {
	const name = (body as { name?: unknown } | null)?.name
	if (typeof name !== 'string' || !name.trim()) return { problem: 'Name is empty' }
	if (name.length > MAX_NAME_LENGTH) return { problem: `Name must be at most ${MAX_NAME_LENGTH} characters` }
	return { name: name.trim() }
}

export function empty_response(item_key: string): ReviewResponse {
	return { item_key, preference: null, issues: { a: [], b: [] }, comment: '' }
}

export const is_answered = (response: ReviewResponse | undefined) => response?.preference !== null && response?.preference !== undefined

/** Where a returning reviewer picks up: the first item they haven't answered, or the first item. */
export function resume_index({ item_keys, responses }: { item_keys: string[], responses: Record<string, ReviewResponse> }): number {
	return Math.max(0, item_keys.findIndex(key => !is_answered(responses[key])))
}
