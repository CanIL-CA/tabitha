import { TOKEN_TYPE, token_has_tag } from '../token'
import { REGEXES } from '../regexes'
import { create_context_filter, create_token_filter, from_built_in_rule, simple_rule_action } from '../rules/rules_parser'
import { apply_rule_to_tokens } from '../rules/rules_processor'
import { check_forms } from './form'
import { check_ontology } from './ontology'
import type { LookupResult, Sentence, Token } from '$lib/types'
import type { BuiltInRule } from '$lib/rules/types'

// Keeps a large passage from opening dozens of simultaneous connections to the lookup services.
// This is just connection hygiene, not a rate-limit workaround -- the services enforce their own
// limit and the http client already retries on 429, so this number isn't tied to any service's
// specific request quota.
const MAX_CONCURRENT_LOOKUPS = 10

export async function perform_form_lookups(sentences: Sentence[]): Promise<Sentence[]> {
	const lookup_tokens = sentences.flatMap(flatten_for_lookup).filter(is_lookup_token)

	await run_with_concurrency_limit(lookup_tokens, check_forms)

	return sentences
}

export async function perform_ontology_lookups(sentences: Sentence[]): Promise<Sentence[]> {
	const lookup_tokens = sentences.flatMap(flatten_for_lookup).filter(is_lookup_token)

	await run_with_concurrency_limit(lookup_tokens, check_ontology)

	result_filter_rules.map(from_built_in_rule('result_filter')).forEach(rule => apply_rule_to_tokens({ tokens: lookup_tokens, rule }))

	return sentences
}

async function run_with_concurrency_limit<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
	const queue = [...items]

	async function worker() {
		for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
			await run(item)
		}
	}

	await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_LOOKUPS, items.length) }, worker))
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
