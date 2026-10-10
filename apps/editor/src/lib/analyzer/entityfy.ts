import { token_has_tag, TOKEN_TYPE } from '#lib/token.js'
import { get_features_for_token } from './features'
import type { SourceEntityCategory, EditorAnalyzedEntity, ConceptKey } from '@tabitha/types'
import type { Sentence, Token } from '#lib/types.js'

export function entityfy(sentences: Sentence[]): EditorAnalyzedEntity[] {
	return entityfy_tokens(sentences.map(sentence => sentence.clause))

	function entityfy_tokens(tokens: Token[]): EditorAnalyzedEntity[] {
		return tokens.flatMap((_, index, tokens) => entityfy_token({ tokens, token_index: index }))
	}

	function entityfy_token({ tokens, token_index }: { tokens: Token[]; token_index: number }): EditorAnalyzedEntity[] {
		const token = tokens[token_index]
		const category = get_token_category(token)
		if (category === null) {
			return []
		}

		const features = get_features_for_token({ tokens, token_index, category })
		if (category === 'Clause') {
			if (token_has_tag({ token, tag_to_check: { 'clause_type': 'main_clause' } })) {
				return [
					create_source_entity({ category, value: '{', features }),
					...entityfy_tokens(token.sub_tokens),
					create_source_entity({ category: 'period', value: '.' }),
					create_source_entity({ value: '}' }),
				]
			} else {
				return [
					create_source_entity({ category, value: '[', features }),
					...entityfy_tokens(token.sub_tokens),
					create_source_entity({ value: ']' }),
				]
			}

		} else if (category.endsWith('Phrase')) {
			// A phrase start
			return [create_source_entity({ category, value: '(', features })]

		} else if (category === '') {
			// A phrase end
			return [create_source_entity({ value: ')' })]

		} else if (token.lookup_results.length) {
			const concept = convert_to_concept(token)
			const pairing_concept = token.pairing ? convert_to_concept(token.pairing) : null
			const noun_list_index = token.tag['noun_index']
			return [create_source_entity({ category, features, concept, pairing_concept, pairing_type: token.pairing_type, noun_list_index })]

		} else {
			return []
		}
	}

	function convert_to_concept(token: Token): ConceptKey {
		const { stem, sense, part_of_speech } = token.lookup_results[0]
		return { stem, sense, part_of_speech }
	}
}

function create_source_entity(overrides: Partial<EditorAnalyzedEntity> = {}): EditorAnalyzedEntity {
	return {
		category: '',
		value: overrides.concept?.stem || '',
		features: [],
		concept: null,
		pairing_concept: null,
		pairing_type: null,
		...overrides,
		noun_list_index: overrides.noun_list_index || (overrides.category === 'Noun' ? '1' : null),
	}
}

const PHRASE_CATEGORY_MAP: Record<string, SourceEntityCategory> = {
	'NP': 'Noun Phrase',
	'VP': 'Verb Phrase',
	'AdjP': 'Adjective Phrase',
	'AdvP': 'Adverb Phrase',
}

function get_token_category(token: Token): SourceEntityCategory | null {
	if (token.type === TOKEN_TYPE.CLAUSE) {
		return 'Clause'
	} else if (token.type === TOKEN_TYPE.PHRASE && token.token.startsWith('{')) {
		// A phrase start token is in the format like "{NP" or "{AdjP"
		return PHRASE_CATEGORY_MAP[token.token.substring(1)]
	} else if (token.type === TOKEN_TYPE.PHRASE && token.token === '}') {
		return ''
	} else if (token.lookup_results.length) {
		return token.lookup_results[0].part_of_speech
	} else {
		return null
	}
}