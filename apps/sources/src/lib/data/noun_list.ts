import { calculate_noun_list_index, calculate_noun_list_position, get_pairing_separator } from '#lib/encoding/semantic_encoding.ts'
import type { NounListEntry } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

export type NounListRow = NounListEntry & { entity_ids: number[] }

const concept_key = ({ stem, sense }: { stem: string, sense: string }): string => `${stem}-${sense}`

/**
 * The noun list as the entities currently use it: one row per index from 1 up to the highest index in use.
 * An index below that which no entity uses is a gap row with no nouns and no entity ids.
 */
export function build_noun_list_rows({ source_entities }: { source_entities: PageSourceEntity[] }): NounListRow[] {
	const rows_by_index = new Map<string, NounListRow>()

	for (const { id, concept, pairing_concept, pairing_type, noun_list_index } of source_entities) {
		if (!noun_list_index || !concept) continue

		const separator = get_pairing_separator({ pairing_type })
		const pairing_key = pairing_concept ? `${concept_key(pairing_concept)}` : ''
		const key = `${concept_key(concept)}${separator}${pairing_key}`
		const row = rows_by_index.get(noun_list_index)
		if (!row) {
			rows_by_index.set(noun_list_index, { index: noun_list_index, noun: key, entity_ids: [id] })
			continue
		}

		row.entity_ids.push(id)
		if (!row.noun.split(', ').includes(key)) {
			row.noun = `${row.noun}, ${key}`
		}
	}

	const highest_position = Math.max(-1, ...[...rows_by_index.keys()].map(calculate_noun_list_position))
	return Array.from({ length: highest_position + 1 }, (_, position) => {
		const index = calculate_noun_list_index(position) ?? '1'
		return rows_by_index.get(index) ?? { index, noun: '', entity_ids: [] }
	})
}

/**
 * Shifts every noun list index down to fill the gaps left by unused indexes, keeping their order.
 * Only indexes on an entity with a concept count as used, matching `build_noun_list_rows`.
 */
export function compact_noun_list_indexes({ source_entities }: { source_entities: PageSourceEntity[] }): PageSourceEntity[] {
	const used_positions = new Set<number>()
	for (const { concept, noun_list_index } of source_entities) {
		if (!noun_list_index || !concept) continue
		used_positions.add(calculate_noun_list_position(noun_list_index))
	}

	const new_index_by_old_index = new Map<string, string>()
	;[...used_positions]
		.sort((a, b) => a - b)
		.forEach((old_position, new_position) => {
			const old_index = calculate_noun_list_index(old_position)
			const new_index = calculate_noun_list_index(new_position)
			if (old_index && new_index) new_index_by_old_index.set(old_index, new_index)
		})

	return source_entities.map(entity => {
		const new_index = entity.noun_list_index && new_index_by_old_index.get(entity.noun_list_index)
		return new_index ? { ...entity, noun_list_index: new_index } : entity
	})
}
