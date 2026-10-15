import type { Cookies } from '@sveltejs/kit'

const COOKIE_NAME = 'survey_reviewer'

// One random id per survey and browser, so a reviewer can close the page and pick up where they
// left off. Scoped to the survey's path so surveys never share a reviewer.
const cookie_path = (survey_id: string) => `/r/${survey_id}`

export function read_reviewer_id({ cookies }: { cookies: Cookies }): string | undefined {
	return cookies.get(COOKIE_NAME)
}

export function ensure_reviewer_id({ cookies, survey_id }: { cookies: Cookies, survey_id: string }): string {
	const existing = cookies.get(COOKIE_NAME)
	if (existing) return existing

	const reviewer_id = crypto.randomUUID()
	cookies.set(COOKIE_NAME, reviewer_id, { path: cookie_path(survey_id), maxAge: 60 * 60 * 24 * 365 })
	return reviewer_id
}
