import { error } from '@sveltejs/kit'
import { tally } from '#lib/results.js'
import { load_results } from '#lib/server/surveys.js'

export async function load({ params, url, locals }) {
	const survey = await load_results({ db: locals.db, survey_id: params.id, results_key: url.searchParams.get('key') ?? '' })
	if (!survey) error(404, 'No results here. Check that you copied the whole results link, including its key.')

	const { review_definition, results_definition, items, responses } = survey
	return {
		title: review_definition.title,
		description: review_definition.description,
		output_names: results_definition.output_names,
		results_stats: results_definition.results_stats,
		tally: tally({ rubric: review_definition.rubric, items, responses }),
	}
}
