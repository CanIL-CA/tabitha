import { error } from '@sveltejs/kit'
import { cached_json } from '@tabitha/api-client'
import { normalize_wildcards } from '@tabitha/types/patterns'
import type { RequestHandler } from './$types'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { TargetFormResult } from '@tabitha/types'
import type { DbRowLexicon } from '#lib/types.js'

// D1 rejects a statement with more than 100 bound parameters, and each batch query also binds the project.
const MAX_WORDS_PER_QUERY = 99
const MAX_WORDS_PER_BATCH = 1000

export async function GET({ locals: { db }, params: { project }, url: { searchParams } }: Parameters<RequestHandler>[0]) {
	const word = normalize_wildcards(searchParams.get('word') ?? '')

	const stem_sql = `
		SELECT *
		FROM Lexicon
		WHERE project = ?
			AND stem LIKE ?
	`
	const forms_sql = `
		SELECT *
		FROM Lexicon
		WHERE project = ?
			AND forms LIKE ?
	`

	const [{ results: stem_matches }, { results: forms_matches }, form_name_by_position] = await Promise.all([
		db.prepare(stem_sql).bind(project, `${word}`).all<DbRowLexicon>(),
		db.prepare(forms_sql).bind(project, `%|${word}|%`).all<DbRowLexicon>(),
		get_form_name_by_position({ db, project }),
	])

	const forms = to_form_results({ word, stem_matches: stem_matches ?? [], forms_matches: forms_matches ?? [], form_name_by_position })

	return cached_json({ data: forms })
}

/**
 * Looks up many words in one request, so a long passage doesn't cost one request per word.
 * Words match exactly (case-insensitive); unlike GET, `*` and `%` are not wildcards here.
 * Responds with each requested word mapped to its forms.
 */
export async function POST({ locals: { db }, params: { project }, request }: Parameters<RequestHandler>[0]) {
	const { words } = await request.json()
	if (!Array.isArray(words) || !words.every(word => typeof word === 'string')) {
		error(400, '"words" must be an array of strings')
	}
	if (words.length > MAX_WORDS_PER_BATCH) {
		error(400, `"words" can hold at most ${MAX_WORDS_PER_BATCH} words`)
	}

	const unique_words: string[] = [...new Set(words.map(word => word.toLowerCase()))]
	const word_chunks = chunk({ items: unique_words, size: MAX_WORDS_PER_QUERY })

	const [stem_rows, forms_rows, form_name_by_position] = await Promise.all([
		Promise.all(word_chunks.map(chunk_words => select_by_stems({ db, project, words: chunk_words }))),
		Promise.all(word_chunks.map(chunk_words => select_by_forms({ db, project, words: chunk_words }))),
		get_form_name_by_position({ db, project }),
	])
	const stem_candidates = stem_rows.flat()
	const forms_candidates = forms_rows.flat()

	const forms_by_word: Record<string, TargetFormResult[]> = Object.fromEntries(words.map(word => {
		const lowercase_word = word.toLowerCase()
		const stem_matches = stem_candidates.filter(row => row.stem.toLowerCase() === lowercase_word)
		const forms_matches = forms_candidates.filter(row => row.forms.toLowerCase().includes(`|${lowercase_word}|`))

		return [word, to_form_results({ word, stem_matches, forms_matches, form_name_by_position })]
	}))

	return Response.json(forms_by_word)
}

async function select_by_stems({ db, project, words }: { db: D1DatabaseSession, project: string, words: string[] }): Promise<DbRowLexicon[]> {
	const placeholders = words.map(() => '?').join(', ')
	const sql = `
		SELECT *
		FROM Lexicon
		WHERE project = ?
			AND lower(stem) IN (${placeholders})
	`
	const { results } = await db.prepare(sql).bind(project, ...words).all<DbRowLexicon>()
	return results ?? []
}

async function select_by_forms({ db, project, words }: { db: D1DatabaseSession, project: string, words: string[] }): Promise<DbRowLexicon[]> {
	const forms_filters = words.map(() => 'forms LIKE ?').join(' OR ')
	const sql = `
		SELECT *
		FROM Lexicon
		WHERE project = ?
			AND (${forms_filters})
	`
	const { results } = await db.prepare(sql).bind(project, ...words.map(word => `%|${word}|%`)).all<DbRowLexicon>()
	return results ?? []
}

async function get_form_name_by_position({ db, project }: { db: D1DatabaseSession, project: string }): Promise<Map<string, string>> {
	const form_names_sql = `
		SELECT part_of_speech, position, name
		FROM Form_Names
		WHERE project = ?
	`
	const { results } = await db.prepare(form_names_sql).bind(project).all<DbRowFormName>()

	return new Map((results ?? []).map(({ part_of_speech, position, name }) => [form_name_key({ part_of_speech, position }), name]))
}

function to_form_results({ word, stem_matches, forms_matches, form_name_by_position }: {
	word: string
	stem_matches: DbRowLexicon[]
	forms_matches: DbRowLexicon[]
	form_name_by_position: Map<string, string>
}): TargetFormResult[] {
	const forms: TargetFormResult[] = []

	for (const { id, stem: base_stem, part_of_speech, constituents } of stem_matches) {
		const stem = derive_stem({ base_stem, constituents })

		forms.push({ id, stem, part_of_speech, form: 'Stem' })
	}

	for (const { id, stem: base_stem, part_of_speech, constituents, forms: encoded_forms } of forms_matches) {
		const stem = derive_stem({ base_stem, constituents })

		const matched_indices = trim_pipes(encoded_forms)
			.split('|')
			.map((form, i) => is_match(form) ? i : -1)
			.filter(i => i > -1)

		for (const i of matched_indices) {
			const position = i + 1
			const name = form_name_by_position.get(form_name_key({ part_of_speech, position })) ?? ''
			forms.push({ id, stem, part_of_speech, form: name })
		}
	}

	return forms

	function derive_stem({ base_stem, constituents }: { base_stem: string; constituents: string }): string {
		if (!constituents) {
			return base_stem
		}

		const constituent = constituents.split('[')[0] ?? ''

		return `${base_stem} ${constituent}`
	}

	function trim_pipes(encoded_forms: string): string {
		const PIPE_IN_FRONT_OR_REAR = /^\||\|$/

		return encoded_forms.replace(PIPE_IN_FRONT_OR_REAR, '')
	}

	function is_match(form: string): boolean {
		if (form.toLowerCase() === word.toLowerCase()) {
			return true
		}

		if (!word.includes('%')) {
			return false
		}

		const constructed_re = new RegExp(word.replaceAll('%', '.*'))

		return constructed_re.test(form)
	}
}

function chunk<T>({ items, size }: { items: T[], size: number }): T[][] {
	return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size))
}

type DbRowFormName = {
	part_of_speech: string
	position: number
	name: string
}

function form_name_key({ part_of_speech, position }: Pick<DbRowFormName, 'part_of_speech' | 'position'>): string {
	return `${part_of_speech}|${position}`
}
