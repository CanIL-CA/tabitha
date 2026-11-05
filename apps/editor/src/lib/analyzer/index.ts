import { phrasify } from '#lib/parser/phrasify.js'
import { entityfy } from './entityfy'
import { replace_gaps } from './gaps'
import { order_constituents } from './ordering'
import { assign_noun_list_indexes, replace_or_insert_noun_relations, replace_punctuation, move_format_markers_out_of_clauses } from './other_rules'
import type { EditorAnalyzeResult, EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence } from '#lib/types.js'

export function analyze(sentences: Sentence[]): EditorAnalyzeResult {
	sentences = replace_punctuation(sentences)
	sentences = phrasify(sentences)
	sentences = replace_or_insert_noun_relations(sentences)
	sentences = replace_gaps(sentences)
	sentences = order_constituents(sentences)
	let entities = entityfy(sentences)
	entities = assign_noun_list_indexes(entities)
	entities = move_format_markers_out_of_clauses(entities)
	return to_source_data(entities)
}

function to_source_data(source_entities: EditorAnalyzedEntity[]): EditorAnalyzeResult {
	return {
		source_entities,
		notes: [],
	}
}