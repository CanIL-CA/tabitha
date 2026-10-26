import { tokenize_input } from './tokenize'
import { perform_form_lookups, perform_ontology_lookups } from '#lib/lookups/index.js'
import { clausify, flatten_sentences } from './clausify'
import { RULES, apply_rules } from '#lib/rules/index.js'
import type { TokenRule } from '#lib/rules/types.ts'
import type { Sentence, Token } from '#lib/types.js'

export async function parse(text: string): Promise<Sentence[]> {
	let sentences = clausify(tokenize_input(text))
	sentences = apply_rules({ sentences, rules: RULES.SYNTAX })
	sentences = await perform_form_lookups(sentences)
	sentences = apply_rules({ sentences, rules: RULES.LOOKUP })
	sentences = await perform_ontology_lookups(sentences)
	sentences = apply_rules({ sentences, rules: RULES.PART_OF_SPEECH })

	return apply_transform_and_sense_rules(sentences)
}

function has_syntax_error(sentence: Sentence): boolean {
	return flatten_sentences([sentence]).some(token => token.messages.some(msg => msg.label === 'error'))
}

export function apply_transform_and_sense_rules(sentences: Sentence[]): Sentence[] {
	sentences = apply_with_syntax_error_check({ sentences, rules: RULES.TRANSFORM })
	return apply_with_syntax_error_check({ sentences, rules: RULES.ARGUMENT_AND_SENSE })
}

export function check_sentences(sentences: Sentence[]): Sentence[] {
	return apply_with_syntax_error_check({ sentences, rules: RULES.CHECKER })
}

// Sentences with syntax errors (eg. bracket mismatch) skip the transform, sense, and checker rules because the errors would likely mess them up,
// and checking a half-analyzed sentence reports false errors. They show only their syntax errors until those are fixed. Other sentences are unaffected.
function apply_with_syntax_error_check({ sentences, rules }: { sentences: Sentence[], rules: TokenRule[] }) {
	// There are some rules that look at neighboring sentences, so we can't treat them totally separate.
	// See Checker rule 'Warn when there is no clause with (simple) after a clause with (complex)'.
	// Instead, if no sentences have a syntax error, do the check all together. If any sentence has a syntax error, check them separately.
	if (sentences.some(sentence => has_syntax_error(sentence))) {
		return sentences.map(sentence => has_syntax_error(sentence) ? sentence : apply_rules({ sentences: [sentence], rules })[0])
	} else {
		return apply_rules({ sentences, rules })
	}
}

/**
 * TODO: temporary... need to build e2e testing infrastructure
 */
export function parse_for_test(text: string): Token[] {
	let sentences = clausify(tokenize_input(text))
	sentences = apply_rules({ sentences, rules: RULES.SYNTAX })
	sentences = apply_rules({ sentences, rules: RULES.LOOKUP })
	sentences = apply_rules({ sentences, rules: RULES.PART_OF_SPEECH })
	sentences = apply_rules({ sentences, rules: RULES.TRANSFORM })
	sentences = apply_rules({ sentences, rules: RULES.ARGUMENT_AND_SENSE })
	sentences = apply_rules({ sentences, rules: RULES.CHECKER.slice(0, 5) })
	return flatten_sentences(sentences)
}
