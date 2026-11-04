import { phrasify } from '#lib/parser/phrasify.js'
import { entityfy } from './entityfy'
import { replace_gaps } from './gaps'
import { order_constituents } from './ordering'
import { assign_noun_list_indexes, replace_or_insert_noun_relations, replace_punctuation } from './other_rules'
import type { EditorAnalyzeResult, EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence } from '#lib/types.js'

export function analyze(sentences: Sentence[]): EditorAnalyzeResult {
	const punctuated = replace_punctuation(sentences)
	const phrasified = phrasify(punctuated)
	const relationated = replace_or_insert_noun_relations(phrasified)
	const gaps_replaced = replace_gaps(relationated)
	const ordered = order_constituents(gaps_replaced)
	const entities = entityfy(ordered)
	const with_noun_indexes = assign_noun_list_indexes(entities)
	const source_data = to_source_data(with_noun_indexes)
	return source_data
}

function to_source_data(source_entities: EditorAnalyzedEntity[]): EditorAnalyzeResult {
	return {
		source_entities,
		notes: [],
	}
}