import { error, json } from '@sveltejs/kit'
import { parse_response } from '#lib/responses.js'
import { read_reviewer_id } from '#lib/server/reviewer_cookie.js'
import { load_review_survey, load_reviewer, save_response } from '#lib/server/surveys.js'

export async function POST({ params, request, cookies, locals }) {
	const reviewer_id = read_reviewer_id({ cookies })
	const reviewer = reviewer_id ? await load_reviewer({ db: locals.db, survey_id: params.id, reviewer_id }) : null
	// The page asks for a name first, which sets the cookie; this only happens if cookies were cleared.
	if (!reviewer_id || !reviewer) error(401, 'Add your name again before scoring')

	const survey = await load_review_survey({ db: locals.db, survey_id: params.id })
	if (!survey) error(404, 'Unknown survey')

	const parsed = parse_response({
		body: await request.json().catch(() => null),
		rubric: survey.definition.rubric,
		item_keys: new Set(survey.items.map(item => item.key)),
	})
	if ('problem' in parsed) error(400, parsed.problem)

	await save_response({ db: locals.db, survey_id: params.id, reviewer_id, response: parsed.response })
	return json({ saved: parsed.response.item_key })
}
