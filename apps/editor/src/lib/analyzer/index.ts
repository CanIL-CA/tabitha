import { phrasify } from '#lib/parser/phrasify.js'
import { flatten_sentences } from '#lib/parser/clausify.ts'
import { entityfy } from './entityfy'
import { replace_gaps } from './gaps'
import { order_constituents } from './ordering'
import { assign_noun_list_indexes, replace_or_insert_noun_relations, replace_punctuation, move_format_markers_out_of_clauses } from './other_rules'
import type { EditorAnalyzeResult, EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence } from '#lib/types.js'
import { simplify_tokens } from '#lib/server/check.ts'
import { parse } from '#lib/parser/index.ts'
import { ANALYZER_CHECKER_RULES } from './checker_rules'
import { apply_rules } from '#lib/rules/rules_processor.ts'
import { token_has_error } from '#lib/token.ts'

export function analyze(sentences: Sentence[]): EditorAnalyzedEntity[] {
	sentences = replace_punctuation(sentences)
	sentences = phrasify(sentences)
	sentences = replace_or_insert_noun_relations(sentences)
	sentences = replace_gaps(sentences)
	sentences = order_constituents(sentences)
	let entities = entityfy(sentences)
	entities = assign_noun_list_indexes(entities)
	entities = move_format_markers_out_of_clauses(entities)
	return entities
}

export async function get_analyze_result(text: string): Promise<EditorAnalyzeResult> {
	const sentences = await parse(text)

	if (has_error(sentences)) {
		return { status: 'error', tokens: simplify_tokens(sentences), source_entities: [] }
	}
	const checked_sentences = apply_rules({ sentences, rules: ANALYZER_CHECKER_RULES })
	if (has_error(checked_sentences)) {
		return { status: 'error', tokens: simplify_tokens(checked_sentences), source_entities: [] }
	}

	return {
		status: 'ok',
		tokens: simplify_tokens(checked_sentences),
		source_entities: analyze(checked_sentences),
	}
}

function has_error(sentences: Sentence[]): boolean {
	return flatten_sentences(sentences).some(token_has_error)
}