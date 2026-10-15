import { error, json } from '@sveltejs/kit'
import { parse_name } from '#lib/responses.js'
import { ensure_reviewer_id } from '#lib/server/reviewer_cookie.js'
import { load_review_survey, save_reviewer_name } from '#lib/server/surveys.js'

export async function POST({ params, request, cookies, locals }) {
	const parsed = parse_name(await request.json().catch(() => null))
	if ('problem' in parsed) error(400, parsed.problem)

	const survey = await load_review_survey({ db: locals.db, survey_id: params.id })
	if (!survey) error(404, 'Unknown survey')

	const reviewer_id = ensure_reviewer_id({ cookies, survey_id: params.id })
	await save_reviewer_name({ db: locals.db, survey_id: params.id, reviewer_id, name: parsed.name })
	return json({ name: parsed.name })
}
