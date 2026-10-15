import type { SurveyDefinition } from '@tabitha/types/survey'
import type { ResultsDefinition, ReviewDefinition, ReviewItem } from './types'

/** Problems that would break the review page, in words the publisher can act on. Empty means
 * the definition can be published. The file comes from our own tooling, so this checks the
 * invariants the app relies on rather than every field's type. */
export function definition_problems(definition: SurveyDefinition): string[] {
	const { rubric, items } = definition
	const problems: string[] = []

	if (!definition.title?.trim()) problems.push('title is empty')
	if (definition.output_names?.length !== 2) problems.push('output_names needs exactly two names')
	if (!rubric?.scale || rubric.scale.length < 3 || rubric.scale.length % 2 === 0) problems.push('rubric.scale needs an odd number of choices, at least 3')
	if (duplicates((rubric?.issues ?? []).map(issue => issue.key)).length) problems.push('rubric.issues has duplicate keys')
	if (!items?.length) problems.push('items is empty')

	for (const key of duplicates((items ?? []).map(item => item.key))) problems.push(`item key "${key}" is used more than once`)
	for (const item of items ?? []) {
		if (item.outputs?.length !== 2) problems.push(`item "${item.key}" needs exactly two outputs`)
	}
	return problems
}

function duplicates(values: string[]): string[] {
	return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]
}

/** The SQL that writes one survey. `swaps[i]` decides whether item i shows its second output as A;
 * the caller draws them at random so the publisher's order doesn't leak into the layout. */
export function publish_sql({ definition, survey_id, results_key, swaps, created_at }: {
	definition: SurveyDefinition
	survey_id: string
	results_key: string
	swaps: boolean[]
	created_at: string
}): string {
	const { title, description, instructions, rubric, output_names, results_stats = [], items } = definition
	const review_definition: ReviewDefinition = { title, description, instructions, rubric }
	const results_definition: ResultsDefinition = { output_names, results_stats }

	const survey_row = `INSERT INTO Surveys (id, results_key, review_definition, results_definition, created_at) VALUES (${[
		survey_id, results_key, JSON.stringify(review_definition), JSON.stringify(results_definition), created_at,
	].map(sql_text).join(', ')});`

	const item_rows = items.map(({ outputs: [first, second], results_notes = [], ...item }, position) => {
		const swapped = swaps[position] ?? false
		const content: ReviewItem = { ...item, outputs: swapped ? { a: second, b: first } : { a: first, b: second } }
		return `INSERT INTO Items (survey_id, key, position, content, swapped, results_notes) VALUES (${[
			sql_text(survey_id), sql_text(item.key), position, sql_text(JSON.stringify(content)), swapped ? 1 : 0, sql_text(JSON.stringify(results_notes)),
		].join(', ')});`
	})

	return [survey_row, ...item_rows].join('\n')
}

function sql_text(value: string): string {
	return `'${value.replaceAll("'", "''")}'`
}
