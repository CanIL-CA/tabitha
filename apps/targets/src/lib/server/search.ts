import type { D1Database } from '@cloudflare/workers-types'
import type { DbRowText, ParsedSearchQuery } from '#lib/types.js'
import type { TargetTextResult } from '@tabitha/types'

export function parse_search_query(q: string): ParsedSearchQuery {
	const normalized_q = normalize_wildcards(q)

	const or_strings = normalized_q.split('|')
	const or_terms = or_strings.map(or_term => ({
		and_terms: [...or_term.matchAll(/\s*"(.+?)"|(\S+)\s*/g)]
			.map(m => m[1] || m[2])
			.map(term => term.trim())
			.filter(term => term.length > 0),
	}))
	return { or_terms }
}

export async function search_text({ db, project, parsed_q }: {
	db: D1Database
	project: string
	parsed_q: ParsedSearchQuery
}): Promise<TargetTextResult[]> {
	if (!parsed_q.or_terms.length || parsed_q.or_terms.every(term => !term.and_terms.length)) {
		return []
	}

	const query_conditions = parsed_q.or_terms.map(or_term => {
		const and_conditions = or_term.and_terms.map(() => 'text LIKE ?').join(' AND ')
		return `(${and_conditions})`
	}).join(' OR ')

	const query = `
		SELECT text, audience, book, chapter, verse
		FROM Text
		WHERE project = ? AND (${query_conditions})
	`

	// Remove wildcards around each query term, as they will be added back in by default
	const q_values = parsed_q.or_terms.flatMap(or_term => or_term.and_terms.map(term => term.replaceAll(/^%|%$/g, '')).map(term => `%${term}%`))

	const { results: matches } = await db.prepare(query).bind(project, ...q_values).all<DbRowText>()

	return transform(matches ?? [])

	function transform(matches: DbRowText[]): TargetTextResult[] {
		return Map.groupBy(matches, m => `${m.book}:${m.chapter}:${m.verse}`).values()
			.map(group => ({
				reference: {
					type: 'Bible',
					id_primary: group[0].book,
					id_secondary: group[0].chapter.toString(),
					id_tertiary: group[0].verse.toString(),
				},
				texts: group.map(({ text, audience }) => ({ text, audience })),
			})).toArray()
	}
}

export function normalize_wildcards(possible_wildcard: string): string {
	return possible_wildcard.replaceAll(/[*#]/g, '%')
}