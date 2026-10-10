import type { D1Database } from '@cloudflare/workers-types'
import { get_concepts } from '#lib/server/ontology.js'
import { decode_categorization_for_update, encode_categorization } from '#lib/transformers.js'
import type { Concept, DbRowConcept, ConceptCreateData, ConceptUpdateData } from '#lib/types.js'
import type { ConceptKey, PartOfSpeech } from '@tabitha/types'

export async function get_concept_for_update({ db, concept_key }: { db: D1Database, concept_key: ConceptKey }): Promise<ConceptUpdateData | null> {
	const sql = `
		SELECT *
		FROM Concepts
		WHERE stem = ? AND sense = ? AND part_of_speech = ?
	`

	const { stem, sense, part_of_speech } = concept_key
	const result = await db.prepare(sql).bind(stem, sense, part_of_speech).first<DbRowConcept>()
	if (!result) {
		return null
	}

	const { level, gloss, brief_gloss, categorization, curated_examples } = result
	return {
		...concept_key,
		level: level.toString(),
		gloss,
		brief_gloss,
		categories: decode_categorization_for_update({ part_of_speech, categorization }),
		curated_examples,
	}
}

export async function update_concept({ db, data }: { db: D1Database, data: ConceptUpdateData }) {
	const sql = `
		UPDATE Concepts
		SET level = ?, gloss = ?, brief_gloss = ?, categorization = ?, curated_examples = ?
		WHERE stem = ? AND sense = ? AND part_of_speech = ?
	`

	const { stem, sense, part_of_speech, level, gloss, brief_gloss, categories, curated_examples } = data
	const categorization = encode_categorization({ part_of_speech, categories })

	await db.prepare(sql).bind(level, gloss, brief_gloss, categorization, curated_examples, stem, sense, part_of_speech).run()
}

export async function get_next_sense({ db, stem, part_of_speech }: { db: D1Database, stem: string, part_of_speech: PartOfSpeech }): Promise<string> {
	const concepts = await get_concepts(db)({ q: stem, category: part_of_speech, scope: 'stems' })
	// the search results are not case-sensitive, so filter out concepts that don't exactly match the stem
	const valid_senses = concepts.filter((c: Concept) => c.stem === stem).map((c: Concept) => c.sense)
	return String.fromCharCode('A'.charCodeAt(0) + valid_senses.length)
}

export async function create_concept({ db, data }: { db: D1Database, data: ConceptCreateData }) {
	// The new concept needs its id set according to its position in the list of concepts sorted by TBTA's custom sorting sequence.
	// All other concepts below it in the order need to have their id incremented to make room for the new concept.
	const new_id = await find_concept_position({ db, data }) + 1 // +1 because ids are 1-based

	const update_sql = `
		UPDATE CONCEPTS SET id = id + 1
		WHERE part_of_speech = ? AND id >= ?
	`
	await db.prepare(update_sql).bind(data.part_of_speech, new_id).run()

	const insert_sql = `
		INSERT INTO Concepts (id, stem, sense, part_of_speech, level, gloss, brief_gloss, categorization, curated_examples, note, occurrences)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "", 0)
	`

	const { stem, sense, part_of_speech, level, gloss, brief_gloss, categories, curated_examples } = data
	const categorization = encode_categorization({ part_of_speech, categories })

	await db.prepare(insert_sql)
		.bind(new_id, stem, sense, part_of_speech, level, gloss, brief_gloss, categorization, curated_examples)
		.run()
}

// TBTA's custom sorting sequence. Characters not in this sequence are ignored in sorting. It is case-insensitive
const SORTING_SEQUENCE = '-0123456789abcdefghijklmnopqrstuvwxyz'
const SORTING_RANK = new Map(SORTING_SEQUENCE.split('').map((char, index) => [char, index]))

/**
 * Compares two stems according to TBTA's custom sorting sequence.
 * Returns a negative number if a < b, positive if a > b, and 0 if equal.
 */
export function compare_stems({ a, b }: { a: string, b: string }): number {
	let i = 0, j = 0

	while (true) {
		// advance i to next valid char in a
		while (i < a.length && !SORTING_RANK.has(a[i])) i++

		// advance j to next valid char in b
		while (j < b.length && !SORTING_RANK.has(b[j])) j++

		// both exhausted → equal
		if (i >= a.length && j >= b.length) return 0

		// one exhausted → shorter (in valid chars) first
		if (i >= a.length) return -1
		if (j >= b.length) return 1

		const ra = SORTING_RANK.get(a[i])! // already known that a[i] exists in SORTING_RANK
		const rb = SORTING_RANK.get(b[j])!

		if (ra !== rb) return ra - rb

		i++
		j++
	}
}

async function find_concept_position({ db, data }: { db: D1Database, data: ConceptKey }): Promise<number> {
	const concepts = await get_concepts(db)({ q: '*', category: data.part_of_speech, scope: 'stems' })

	const new_stem_lower = data.stem.toLowerCase()
	const position = concepts.findIndex(({ stem }: Concept) => compare_stems({ a: stem.toLowerCase(), b: new_stem_lower }) > 0)
	return position >= 0 ? position : concepts.length
}