import { timingSafeEqual } from 'node:crypto'
import type { D1Database } from '@cloudflare/workers-types'
import type { NamedResponse, ResultsItem } from '#lib/results.js'
import type { ResultsDefinition, ReviewDefinition, ReviewItem, ReviewResponse } from '#lib/types.js'

type SurveyRow = { review_definition: string, results_definition: string, results_key: string }
type ResponseRow = { item_key: string, preference: number | null, issues_a: string, issues_b: string, comment: string }

export type ReviewSurvey = {
	definition: ReviewDefinition
	items: ReviewItem[]
}

export async function load_review_survey({ db, survey_id }: { db: D1Database, survey_id: string }): Promise<ReviewSurvey | null> {
	const survey = await db.prepare('SELECT review_definition FROM Surveys WHERE id = ?').bind(survey_id).first<Pick<SurveyRow, 'review_definition'>>()
	if (!survey) return null

	const { results } = await db.prepare('SELECT content FROM Items WHERE survey_id = ? ORDER BY position').bind(survey_id).all<{ content: string }>()
	return {
		definition: JSON.parse(survey.review_definition) as ReviewDefinition,
		items: results.map(row => JSON.parse(row.content) as ReviewItem),
	}
}

export async function load_reviewer({ db, survey_id, reviewer_id }: {
	db: D1Database
	survey_id: string
	reviewer_id: string
}): Promise<{ name: string, responses: ReviewResponse[] } | null> {
	const reviewer = await db.prepare('SELECT name FROM Reviewers WHERE survey_id = ? AND id = ?').bind(survey_id, reviewer_id).first<{ name: string }>()
	if (!reviewer) return null

	const { results } = await db.prepare('SELECT item_key, preference, issues_a, issues_b, comment FROM Responses WHERE survey_id = ? AND reviewer_id = ?')
		.bind(survey_id, reviewer_id)
		.all<ResponseRow>()
	return { name: reviewer.name, responses: results.map(to_response) }
}

export async function save_reviewer_name({ db, survey_id, reviewer_id, name }: {
	db: D1Database
	survey_id: string
	reviewer_id: string
	name: string
}): Promise<void> {
	await db.prepare('INSERT INTO Reviewers (survey_id, id, name) VALUES (?, ?, ?) ON CONFLICT (survey_id, id) DO UPDATE SET name = excluded.name')
		.bind(survey_id, reviewer_id, name)
		.run()
}

export async function save_response({ db, survey_id, reviewer_id, response }: {
	db: D1Database
	survey_id: string
	reviewer_id: string
	response: ReviewResponse
}): Promise<void> {
	const { item_key, preference, issues, comment } = response
	await db.prepare(`INSERT INTO Responses (survey_id, reviewer_id, item_key, preference, issues_a, issues_b, comment, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (survey_id, reviewer_id, item_key) DO UPDATE SET
			preference = excluded.preference, issues_a = excluded.issues_a, issues_b = excluded.issues_b,
			comment = excluded.comment, updated_at = excluded.updated_at`)
		.bind(survey_id, reviewer_id, item_key, preference, JSON.stringify(issues.a), JSON.stringify(issues.b), comment, new Date().toISOString())
		.run()
}

export type ResultsSurvey = {
	review_definition: ReviewDefinition
	results_definition: ResultsDefinition
	items: (ResultsItem & Pick<ReviewItem, 'note'>)[]
	responses: NamedResponse[]
}

/** Null both for an unknown survey and a wrong key, so the key can't be probed survey by survey. */
export async function load_results({ db, survey_id, results_key }: {
	db: D1Database
	survey_id: string
	results_key: string
}): Promise<ResultsSurvey | null> {
	const survey = await db.prepare('SELECT review_definition, results_definition, results_key FROM Surveys WHERE id = ?').bind(survey_id).first<SurveyRow>()
	if (!survey || !same_secret({ given: results_key, expected: survey.results_key })) return null

	const [items, responses] = await db.batch<Record<string, unknown>>([
		db.prepare('SELECT key, content, swapped, results_notes FROM Items WHERE survey_id = ? ORDER BY position').bind(survey_id),
		db.prepare(`SELECT Responses.item_key, Responses.preference, Responses.issues_a, Responses.issues_b, Responses.comment,
				Responses.reviewer_id, Reviewers.name AS reviewer_name
			FROM Responses JOIN Reviewers ON Reviewers.survey_id = Responses.survey_id AND Reviewers.id = Responses.reviewer_id
			WHERE Responses.survey_id = ?`).bind(survey_id),
	])

	return {
		review_definition: JSON.parse(survey.review_definition) as ReviewDefinition,
		results_definition: JSON.parse(survey.results_definition) as ResultsDefinition,
		items: (items.results as { key: string, content: string, swapped: number, results_notes: string }[]).map(row => {
			const { title, chips, note } = JSON.parse(row.content) as ReviewItem
			return { key: row.key, title, chips, note, swapped: row.swapped === 1, results_notes: JSON.parse(row.results_notes) as string[] }
		}),
		responses: (responses.results as (ResponseRow & { reviewer_id: string, reviewer_name: string })[])
			.map(row => ({ ...to_response(row), reviewer_id: row.reviewer_id, reviewer_name: row.reviewer_name })),
	}
}

function to_response(row: ResponseRow): ReviewResponse {
	return {
		item_key: row.item_key,
		preference: row.preference,
		issues: { a: JSON.parse(row.issues_a) as string[], b: JSON.parse(row.issues_b) as string[] },
		comment: row.comment,
	}
}

/** Compares in time independent of where the strings first differ. node:crypto's version runs in
 * both the Worker (nodejs_compat) and local vite dev, unlike the Workers-only crypto.subtle one. */
function same_secret({ given, expected }: { given: string, expected: string }): boolean {
	const a = Buffer.from(given)
	const b = Buffer.from(expected)
	return a.byteLength === b.byteLength && timingSafeEqual(a, b)
}
