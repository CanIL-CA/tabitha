import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { normalize_wildcards, parse_concept_sense, concepts_match } from '@tabitha/types/patterns'
import { decode_categorization, transform_curated_examples } from '#lib/transformers.js'
import { get_pending_changes } from './changes/changes'
import type { Concept, DbRowConcept, DbRowExample } from '#lib/types.js'
import type { ConceptKey, ConceptSearchFilter, ConceptExample, SimplificationHint } from '@tabitha/types'
import type { ConceptLookupKey } from './concept_embeddings'

// refs:
// 	https://www.sqlite.org/lang_expr.html#the_like_glob_regexp_match_and_extract_operators
// 	https://developers.cloudflare.com/d1/platform/client-api/#searching-with-like
// 	https://developers.cloudflare.com/d1/platform/client-api/#parameter-binding
export async function get_all_concepts(db: D1Database): Promise<Concept[]> {
	const { results } = await db.prepare('SELECT * FROM Concepts').all<DbRowConcept>()
	const concepts = results.map(transform)

	const { results: how_to_results } = await db.prepare('SELECT * FROM Complex_Terms').all<SimplificationHint>()

	return merge_how_to_results({ concepts, how_to_results })
}

/**
 * Exact, case-sensitive lookup of specific concepts -- both ontology entries and how-to-only
 * ones -- without reading either table in full.
 */
export async function get_concepts_by_keys({ db, keys }: { db: D1Database, keys: ConceptLookupKey[] }): Promise<Concept[]> {
	if (!keys.length) return []

	const key_rows = keys.map(() => '(?, ?, ?)').join(', ')
	const where_clause = `(stem, sense, part_of_speech) IN (VALUES ${key_rows})`
	const params = keys.flatMap(({ stem, sense, part_of_speech }) => [stem, sense, part_of_speech])

	const [{ results: concept_rows }, { results: how_to_results }] = await Promise.all([
		db.prepare(`SELECT * FROM Concepts WHERE ${where_clause}`).bind(...params).all<DbRowConcept>(),
		db.prepare(`SELECT * FROM Complex_Terms WHERE ${where_clause}`).bind(...params).all<SimplificationHint>(),
	])

	return merge_how_to_results({ concepts: concept_rows.map(transform), how_to_results })
}

/**
 * case-insensitive match, will accept % as a wildcard as well as sense-specific search, e.g., love-A
 */
export const get_concepts = (db: D1Database) => async (concept_filter: ConceptSearchFilter): Promise<Concept[]> => {
	const query_builder = build_concept_query({ db, table: 'Concepts' })

	if (concept_filter.category && concept_filter.category !== 'all') {
		query_builder.add_filter('part_of_speech = ?', [concept_filter.category])
	}

	const parsed_concept = parse_concept_sense(concept_filter.q)
	if (parsed_concept) {
		query_builder
			.add_filter('stem LIKE ?', [parsed_concept.stem])
			.add_filter('sense = ?', [parsed_concept.sense])
	} else {
		const normalized_q = normalize_wildcards(concept_filter.q)

		const scope_filters: Record<string, [string, string[]]> = {
			stems: ['stem LIKE ?', [normalized_q]],
			semantic: ['stem LIKE ?', [normalized_q]],
			glosses: ['gloss LIKE ?', [`%${normalized_q}%`]],
			all: ['stem LIKE ? OR gloss LIKE ?', [normalized_q, `%${normalized_q}%`]],
		}
		const filter_clause = scope_filters[concept_filter.scope] ?? scope_filters.stems
		query_builder.add_filter(filter_clause[0], filter_clause[1])
	}

	query_builder.order_by('id')

	const { results } = await query_builder.prepare().all<DbRowConcept>()
	const concepts = results.map(transform)

	const all_pending_changes = await get_pending_changes(db)
	for (const concept of concepts) {
		concept.pending_changes = all_pending_changes.filter(change => concepts_match({ a: concept, b: change.concept }))
	}

	const how_to_results = await get_simplification_hints(db)(concept_filter)
	return merge_how_to_results({ concepts, how_to_results })
}

function transform(match_from_db: DbRowConcept): Concept {
	return {
		...match_from_db,
		level: match_from_db.level.toString(),
		categories: decode_categorization({ part_of_speech: match_from_db.part_of_speech, categorization: match_from_db.categorization }),
		curated_examples: transform_curated_examples(match_from_db.curated_examples),
		curated_examples_raw: match_from_db.curated_examples,
		status: 'in ontology',
		how_to_hints: [],
		pending_changes: [],
	}
}

export async function get_version(db: D1Database): Promise<string> {
	const sql = `
		SELECT version
		FROM Version
	`
	const version = await db.prepare(sql).first<string>('version')
	return version || ''
}

/**
 * case-insensitive match, will accept % as a wildcard as well as sense-specific search, e.g., love-A
 */
export const get_simplification_hints = (db: D1Database) => async (filter: ConceptSearchFilter): Promise<SimplificationHint[]> => {
	if (filter.scope === 'glosses') {
		// a glosses search doesn't make sense for simplification hints
		return []
	}

	const query_builder = build_concept_query({ db, table: 'Complex_Terms' })

	if (filter.category && filter.category !== 'all') {
		query_builder.add_filter('part_of_speech = ?', [filter.category])
	}

	const parsed_filter = parse_concept_sense(filter.q)
	if (parsed_filter) {
		query_builder
			.add_filter('stem LIKE ?', [parsed_filter.stem])
			.add_filter('sense = ?', [parsed_filter.sense])
	} else {
		const normalized_q = normalize_wildcards(filter.q)
		query_builder.add_filter('stem LIKE ?', [normalized_q])

		if (normalized_q === '%') {
			// if the query is just a wildcard, just return hints for existing concepts (ones with a sense),
			// as the user only wants to see what's actually in the ontology
			query_builder.add_filter('sense LIKE "_"', [])
		}
	}

	const { results } = await query_builder.prepare().all<SimplificationHint>()

	return results.map(({ stem, sense, part_of_speech, structure, pairing, explication, ontology_status, level }) => ({
		stem,
		sense,
		part_of_speech,
		structure,
		pairing,
		explication,
		ontology_status,
		level,
	}))
}

/**
 * Concept is case-sensitive
 */
export const get_examples = (db: D1Database) => async (
	concept: string,
	part_of_speech: string,
	source: string,
): Promise<ConceptExample[]> => {
	const parsed_concept = parse_concept_sense(concept)
	const stem = parsed_concept ? parsed_concept.stem : concept
	const sense = parsed_concept ? parsed_concept.sense : 'A'

	const { results } = await db.prepare(`
		SELECT E.ref_type, RPL.name AS ref_id_primary, E.ref_id_secondary, E.ref_id_tertiary, E.context_json
		FROM Exhaustive_Examples AS E
		INNER JOIN Reference_Primary_Lookup AS RPL ON E.ref_id_primary = RPL.id
		WHERE E.concept_stem = ? AND E.concept_sense = ? AND E.concept_part_of_speech = ? AND E.ref_type LIKE ?
	`).bind(stem, sense, part_of_speech, source.length ? source : '%').all<DbRowExample>()

	return results.map(({ ref_type, ref_id_primary, ref_id_secondary, ref_id_tertiary, context_json }) => ({
		reference: {
			type: ref_type,
			id_primary: ref_id_primary,
			id_secondary: ref_id_secondary.toString(),
			id_tertiary: ref_id_tertiary.toString(),
		},
		context: JSON.parse(context_json),
		book_status: 'Ready to Translate', // this will be updated after the API call to Sources
	}))
}

type MergeHowToResultsOptions = {
	readonly concepts: Concept[]
	readonly how_to_results: SimplificationHint[]
}

export function merge_how_to_results({ concepts, how_to_results }: MergeHowToResultsOptions): Concept[] {
	const merged_concepts = [...concepts]
	const concept_map = new Map<string, Concept>()

	for (const concept of merged_concepts) {
		concept_map.set(create_concept_key(concept), concept)
	}

	for (const how_to of how_to_results) {
		const key = create_concept_key(how_to)
		const existing_concept = concept_map.get(key)
		if (existing_concept) {
			existing_concept.how_to_hints.push(how_to)
		} else {
			const new_concept = create_how_to_result(how_to)
			concept_map.set(key, new_concept)
			merged_concepts.push(new_concept)
		}
	}
	return merged_concepts

	function create_how_to_result(hint: SimplificationHint): Concept {
		const level = hint.level === -1 ? 'N/A' : hint.level.toString()
		const gloss_map = new Map([
			['approved', 'Not yet in the Ontology, but will be added in a future update'],
			['suggested', 'Not in the Ontology, but has been suggested, and discussion is ongoing'],
			['not used', 'NOT IN THE ONTOLOGY, but suggestions are available'],
			['in ontology', 'Inaccurately marked as "in ontology". Please update the How-To document'],
		])
		const gloss = gloss_map.get(hint.ontology_status) ?? 'Unexpected Ontology Status. Please update the How-To document'
		return {
			id: create_concept_key(hint),
			stem: hint.stem,
			sense: hint.sense,
			part_of_speech: hint.part_of_speech,
			level,
			categorization: '',
			examples: '',
			gloss,
			brief_gloss: '',
			occurrences: 0,
			categories: [],
			curated_examples: [],
			curated_examples_raw: '',
			status: hint.ontology_status,
			how_to_hints: [hint],
			pending_changes: [],
		}
	}

	function create_concept_key({ stem, sense, part_of_speech }: ConceptKey | Concept): string {
		return `${stem}-${sense}-${part_of_speech}`
	}
}

type ConceptQueryBuilder = {
	add_filter: (filter: string, params: (string | number)[]) => ConceptQueryBuilder
	order_by: (column: string) => ConceptQueryBuilder
	prepare: () => D1PreparedStatement
}

function build_concept_query({ db, table }: { db: D1Database, table: string }): ConceptQueryBuilder {
	const all_filters: string[] = []
	const all_params: (string | number)[] = []
	let order_by_sql = ''

	const builder: ConceptQueryBuilder = {
		add_filter(filter: string, params: (string | number)[]) {
			all_filters.push(filter)
			all_params.push(...params)
			return builder
		},
		order_by(column: string) {
			order_by_sql = `ORDER BY ${column}`
			return builder
		},
		prepare(): D1PreparedStatement {
			const joined_filters = all_filters.map(filter => `(${filter})`).join(' AND ')
			return db.prepare(`
				SELECT *
				FROM ${table}
				WHERE ${joined_filters}
				${order_by_sql}`).bind(...all_params)
		},
	}

	return builder
}
