import { error } from '@sveltejs/kit'
import { read_reviewer_id } from '#lib/server/reviewer_cookie.js'
import { load_review_survey, load_reviewer } from '#lib/server/surveys.js'

export async function load({ params, cookies, locals }) {
	const survey = await load_review_survey({ db: locals.db, survey_id: params.id })
	if (!survey) error(404, "This survey link doesn't exist. Check that you copied the whole link.")

	const reviewer_id = read_reviewer_id({ cookies })
	const reviewer = reviewer_id ? await load_reviewer({ db: locals.db, survey_id: params.id, reviewer_id }) : null

	return {
		survey,
		reviewer_name: reviewer?.name ?? '',
		responses: reviewer?.responses ?? [],
	}
}
