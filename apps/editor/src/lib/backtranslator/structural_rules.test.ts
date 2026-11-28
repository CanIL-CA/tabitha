import { describe, expect, test } from 'vitest'
import { TOKEN_TYPE, create_clause_token, create_token } from '#lib/token.js'
import { apply_rules } from '#lib/rules/index.js'
import { lookup_result_for_test } from '#lib/test_helps.js'
import { BT_STRUCTURAL_RULES } from './structural_rules'
import { find_replace, textify } from '.'
import type { Token } from '#lib/types.js'

const phrase_start = (token: string) => create_token({ token, type: TOKEN_TYPE.PHRASE })
const phrase_end = () => create_token({ token: '}', type: TOKEN_TYPE.PHRASE })
const noun = (stem: string) => create_token({ token: stem, type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [lookup_result_for_test({ stem })] })
const verb = (stem: string) => create_token({ token: stem, type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [lookup_result_for_test({ stem, part_of_speech: 'Verb' })] })
const article = () => create_token({ token: 'a', type: TOKEN_TYPE.FUNCTION_WORD, tag: { determiner: 'indefinite_article' } })
const named = () => create_token({ token: 'named', type: TOKEN_TYPE.FUNCTION_WORD, tag: { relation: 'name', pre_np_adposition: 'relation' } })
const note = (token: string) => create_token({ token, type: TOKEN_TYPE.NOTE })
const period = () => create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION })

function back_translate_phrases(sub_tokens: Token[]): string {
	const sentences = [{ clause: create_clause_token({ sub_tokens, tag: { clause_type: 'main_clause' } }) }]
	return find_replace(textify(apply_rules({ sentences, rules: BT_STRUCTURAL_RULES })))
}

describe('Explain name', () => {
	test('moves the explained name into an implicit phrase', () => {
		// Yahweh sent Othniel named a man _explainName.
		const tokens = [
			phrase_start('{NP'), noun('Yahweh'), phrase_end(),
			phrase_start('{VP'), verb('sent'), phrase_end(),
			phrase_start('{NP'), noun('Othniel'),
			phrase_start('{NP'), named(), article(), noun('man'), note('_explainName'), phrase_end(),
			phrase_end(),
			period(),
		]

		expect(back_translate_phrases(tokens)).toBe('the LORD sent <<a man named>> Othniel.')
	})

	test('leaves the sentence as written when the note follows "named" outside a noun phrase', () => {
		// Yahweh sent a man named _explainName Othniel.
		const tokens = [
			phrase_start('{NP'), noun('Yahweh'), phrase_end(),
			phrase_start('{VP'), verb('sent'), phrase_end(),
			phrase_start('{NP'), article(), noun('man'), phrase_end(),
			named(), note('_explainName'),
			phrase_start('{NP'), noun('Othniel'), phrase_end(),
			period(),
		]

		expect(back_translate_phrases(tokens)).toBe('the LORD sent a man named Othniel.')
	})
})
