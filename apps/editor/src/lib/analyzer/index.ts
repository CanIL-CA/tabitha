import { phrasify } from '#lib/parser/phrasify.js'
import { entityfy } from './entityfy'
import { order_entities } from './ordering'
import { populate_noun_list, replace_punctuation } from './other_rules'
import type { EditorAnalyzeResult, EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence } from '#lib/types.js'

export function analyze(sentences: Sentence[]): EditorAnalyzeResult {
	const punctuated = replace_punctuation(sentences)
	const phrasified = phrasify(punctuated)
	// replace GAP tokens
	// other movement rules,
	const entities = entityfy(phrasified)
	const ordered = order_entities(entities)
	const source_data = to_source_data(ordered)
	return source_data
}

function to_source_data(source_entities: EditorAnalyzedEntity[]): EditorAnalyzeResult {
	return {
		source_entities,
		noun_list: populate_noun_list(source_entities),
		notes: [],
	}
}