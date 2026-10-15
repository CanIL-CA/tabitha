import { tokenize_input } from './tokenize'
import { perform_form_lookups, perform_ontology_lookups } from '#lib/lookups/index.js'
import { clausify, flatten_sentences } from './clausify'
import { RULES, rules_applier } from '#lib/rules/index.js'
import type { Sentence, Token } from '#lib/types.js'

export async function parse(text: string): Promise<Sentence[]> {
	let sentences = clausify(tokenize_input(text))
	sentences = rules_applier(RULES.SYNTAX)(sentences)
	sentences = await perform_form_lookups(sentences)
	sentences = rules_applier(RULES.LOOKUP)(sentences)
	sentences = await perform_ontology_lookups(sentences)
	sentences = rules_applier(RULES.PART_OF_SPEECH)(sentences)

	return apply_transform_and_sense_rules(sentences)
}

function has_syntax_error(sentence: Sentence): boolean {
	return flatten_sentences([sentence]).some(token => token.messages.some(msg => msg.label === 'error'))
}

// Sentences with syntax errors (eg. bracket mismatch) skip the transform, sense, and checker rules because the errors would likely mess them up,
// and checking a half-analyzed sentence reports false errors. They show only their syntax errors until those are fixed. Other sentences are unaffected.
export function apply_transform_and_sense_rules(sentences: Sentence[]): Sentence[] {
	return sentences.map(sentence => has_syntax_error(sentence) ? sentence : rules_applier(RULES.ARGUMENT_AND_SENSE)(rules_applier(RULES.TRANSFORM)([sentence]))[0])
}

export function check_sentences(sentences: Sentence[]): Sentence[] {
	return sentences.map(sentence => has_syntax_error(sentence) ? sentence : rules_applier(RULES.CHECKER)([sentence])[0])
}

/**
 * TODO: temporary... need to build e2e testing infrastructure
 */
export function parse_for_test(text: string): Token[] {
	let sentences = clausify(tokenize_input(text))
	sentences = rules_applier(RULES.SYNTAX)(sentences)
	sentences = rules_applier(RULES.LOOKUP)(sentences)
	sentences = rules_applier(RULES.PART_OF_SPEECH)(sentences)
	sentences = rules_applier(RULES.TRANSFORM)(sentences)
	sentences = rules_applier(RULES.ARGUMENT_AND_SENSE)(sentences)
	sentences = rules_applier(RULES.CHECKER.slice(0, 5))(sentences)
	return flatten_sentences(sentences)
}
