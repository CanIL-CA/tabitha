import type { RequestHandler } from '@sveltejs/kit'
import { cached_json } from '@tabitha/api-client'
import { normalize_wildcards } from '@tabitha/types/patterns'
import type { TargetFormResult } from '@tabitha/types'
import type { DbRowLexicon } from '#lib/types.js'

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

	const form_names_sql = `
		SELECT part_of_speech, position, name
		FROM Form_Names
		WHERE project = ?
	`

	const [{ results: stem_matches }, { results: forms_matches }, { results: form_names }] = await Promise.all([
		db.prepare(stem_sql).bind(project, `${word}`).all<DbRowLexicon>(),
		db.prepare(forms_sql).bind(project, `%|${word}|%`).all<DbRowLexicon>(),
		db.prepare(form_names_sql).bind(project).all<DbRowFormName>(),
	])

	const form_name_by_position = new Map((form_names ?? []).map(({ part_of_speech, position, name }) => [form_name_key({ part_of_speech, position }), name]))

	const forms: TargetFormResult[] = transform({ stem_matches: stem_matches ?? [], forms_matches: forms_matches ?? [] })

	return cached_json({ data: forms })

	function transform({ stem_matches, forms_matches }: { stem_matches: DbRowLexicon[]; forms_matches: DbRowLexicon[] }): TargetFormResult[] {
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
}

type DbRowFormName = {
	part_of_speech: string
	position: number
	name: string
}

function form_name_key({ part_of_speech, position }: Pick<DbRowFormName, 'part_of_speech' | 'position'>): string {
	return `${part_of_speech}|${position}`
}
