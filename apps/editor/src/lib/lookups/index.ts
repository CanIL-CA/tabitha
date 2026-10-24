import { TOKEN_TYPE, token_has_tag } from '../token'
import { REGEXES } from '../regexes'
import { create_context_filter, create_token_filter, from_built_in_rule, simple_rule_action } from '../rules/rules_parser'
import { apply_rule_to_tokens } from '../rules/rules_processor'
import { check_forms } from './form'
import { check_ontology } from './ontology'
import type { LookupResult, Sentence, Token } from '#lib/types.js'
import type { BuiltInRule } from '#lib/rules/types.js'

export async function perform_form_lookups(sentences: Sentence[]): Promise<Sentence[]> {
	const lookup_tokens = sentences.flatMap(flatten_for_lookup).filter(is_lookup_token)

	await check_forms(lookup_tokens)

	return sentences
}

export async function perform_ontology_lookups(sentences: Sentence[]): Promise<Sentence[]> {
	const lookup_tokens = sentences.flatMap(flatten_for_lookup).filter(is_lookup_token)

	await check_ontology(lookup_tokens)

	result_filter_rules.map(from_built_in_rule('result_filter')).forEach(rule => apply_rule_to_tokens({ tokens: lookup_tokens, rule }))

	return sentences
}

function flatten_for_lookup(sentence: Sentence): Token[] {
	return flatten_tokens(sentence.clause)

	function flatten_tokens(token: Token): Token[] {
		if (token.type === TOKEN_TYPE.CLAUSE) {
			return token.sub_tokens.flatMap(flatten_tokens)
		} else if (token.pairing) {
			return [token, token.pairing]
		}
		return [token]
	}
}

function is_lookup_token(token: Token): boolean {
	return token.type === TOKEN_TYPE.LOOKUP_WORD
}

const result_filter_rules: BuiltInRule[] = [
	{
		name: 'Filter lookup results based on upper/lowercase for words not at the start of the sentence.',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && !token_has_tag({ token, tag_to_check: { 'position': 'first_word' } }),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token: token }) => {
				filter_results_by_capitalization(token)
				if (token.pairing) {
					filter_results_by_capitalization(token.pairing)
				}
			}),
		},
	},
	{
		name: 'Choose between a capitalized and a lowercase concept of the same part of speech for the first word of a sentence.',
		comment: "The first word is capitalized whatever it is, so its capitalization says nothing. A plural is the common noun, eg. 'Fathers, do not…' (Eph 6:4). A singular is the proper noun only for the stems that Scripture uses that way, eg. 'Lot looked…' (Gen 13:10). Other words stay ambiguous, eg. 'Sin wants to destroy you' (Gen 4:7).",
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && token_has_tag({ token, tag_to_check: { 'position': 'first_word' } }),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token: token }) => {
				resolve_capitalized_first_word(token)
				if (token.pairing) {
					resolve_capitalized_first_word(token.pairing)
				}
			}),
		},
	},
	{
		name: 'Remove lookup results that are only in the English lexicon if the word has results from the Ontology',
		comment: "eg. 'life' is an Adjective in the English lexicon only for 'life boat' (Acts 27:16), but only a Noun in the Ontology. Words with no Ontology results at all keep their lexicon results, so they are still flagged as not recognized with their part of speech.",
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && token.lookup_results.some(is_from_ontology),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.lookup_results = trigger_token.lookup_results.filter(is_from_ontology)
			}),
		},
	},
	{
		name: 'Remove lookup results for certain functional Adpositions (up, down, etc)',
		comment: 'While these have an entry in the Ontology, they are only used in the Analyzer with specific Verbs. They should not be recognized as words on their own.',
		rule: {
			trigger: create_token_filter({ 'token': 'to|down|off|out|up' }),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.lookup_results = []
			}),
		},
	},
]

// Stems whose sentence-initial singular is always the proper noun in the phase 1 text, checked against phase 2.
// Add a stem only when Scripture shows it, eg. 'Son of Abinoam' (Judg 5:12) is the common noun.
const PROPER_FIRST_WORDS = new Set(['God', 'Lord', 'Lot', 'Father', 'Ram'])

function resolve_capitalized_first_word(token: Token) {
	if (starts_lowercase(token.token)) {
		return
	}

	const results = token.lookup_results
	token.lookup_results = results.filter(result => !results.some(preferred => is_preferred_first_word({ preferred, other: result })))
}

function is_preferred_first_word({ preferred, other }: { preferred: LookupResult, other: LookupResult }): boolean {
	const is_capitalization_pair = preferred.stem !== other.stem
		&& preferred.stem.toLowerCase() === other.stem.toLowerCase()
		&& preferred.part_of_speech === other.part_of_speech
	if (!is_capitalization_pair) {
		return false
	}

	return is_plural(preferred)
		? starts_lowercase(preferred.stem)
		: PROPER_FIRST_WORDS.has(preferred.stem)
}

function is_plural(result: LookupResult): boolean {
	return result.form.split('|').includes('plural')
}

function is_from_ontology(result: LookupResult): boolean {
	return result.ontology_status !== 'unknown'
}

function starts_lowercase(text: string): boolean {
	return REGEXES.STARTS_LOWERCASE.test(text)
}

function filter_results_by_capitalization(token: Token) {
	if (token.token === 'null') {
		// 'null' is used for some double pairings like 'friends/brothers and null/sisters', and for some dynamic\literal pairings.
		// But the concept in the ontology is NULL, so should not be filtered by capitalization
		return
	}

	token.lookup_results = starts_lowercase(token.token)
		? token.lookup_results.filter(result => starts_lowercase(result.stem))
		: token.lookup_results.filter(result => !starts_lowercase(result.stem))
}
