import { TOKEN_TYPE, create_token } from '#lib/token.js'
import { create_token_filter } from '#lib/rules/rules_parser.js'
import type { Phrase, Sentence, Token, Tag } from '#lib/types.js'
import type { TokenFilter, TokenFilterJson } from '#lib/rules/types.js'

export function phrasify(sentences: Sentence[]): Sentence[] {
	return phrasify_tokens(sentences.map(sentence => sentence.clause)).map(clause => ({ clause }))
}

function phrasify_tokens(tokens: Token[]): Token[] {
	if (tokens.length === 0) {
		return []
	}

	tokens = tokens.slice()

	const IS_PHRASE_HEAD = create_token_filter({ 'category': 'Noun|Verb|Adjective|Adverb' })

	// create phrases around each head (Nouns, Verbs, Adjectives, Adverbs)
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]
		if (IS_PHRASE_HEAD(token)) {
			tokens[i] = create_phrase(token)
		} else if (token.type === TOKEN_TYPE.CLAUSE) {
			token.sub_tokens = phrasify_tokens(token.sub_tokens)
		}
	}

	// expand phrases twice so nested phrases can get handled
	expand_phrases(+1)
	// go in the reverse direction the second time so doubly nested phrases are handled properly
	// eg. 'John has (faith (in God (named Yahweh))).'
	expand_phrases(-1)

	return tokens.flatMap(flatten_phrases)

	// direction: +1 for forward, -1 for reverse
	function expand_phrases(direction: number) {
		const i_start = direction < 0 ? tokens.length - 1 : 0
		const i_condition = direction < 0
			? (i: number) => i >= 0
			: (i: number) => i < tokens.length

		for (let i = i_start; i_condition(i); i += direction) {
			const token = tokens[i]

			if (token.type !== TOKEN_TYPE.PHRASE) {
				continue
			}

			// find all tokens IN FRONT OF the current phrase that should be included
			const pre_token_filters = ORDERED_PHRASE_PRE_FILTERS.find(([phrase_filter]) => phrase_filter(token))?.[1] ?? []
			let pre_index = i - 1
			for (const token_filter of pre_token_filters) {
				// keep matching the filter until it no longer matches. then move on to the next filter and repeat
				while (pre_index >= 0 && token_filter(tokens[pre_index])) {
					pre_index -= 1
				}
			}

			// find all tokens AFTER the current phrase that should be included
			const post_token_filters = ORDERED_PHRASE_POST_FILTERS.find(([phrase_filter]) => phrase_filter(token))?.[1] ?? []
			// underscore notes always directly follow the word they're associated with
			post_token_filters.splice(0, 0, token => token.token.startsWith('_'))
			let post_index = i + 1
			for (const token_filter of post_token_filters) {
				// keep matching the filter until it no longer matches. then move on to the next filter and repeat
				while (post_index < tokens.length && token_filter(tokens[post_index])) {
					post_index += 1
				}
			}

			const phrase_start = pre_index + 1
			token.sub_tokens = [
				...tokens.slice(phrase_start, i),
				...token.sub_tokens,
				...tokens.slice(i + 1, post_index),
			]
			// add any relation tag from the new sub_tokens into the phrase tag
			const relation_filter = create_token_filter({ 'tag': 'relation', 'type': TOKEN_TYPE.FUNCTION_WORD })
			const relation = token.sub_tokens.find(relation_filter)?.tag['relation']
			if (relation) {
				token.tag['relation'] = relation
			}

			tokens = [
				...tokens.slice(0, phrase_start),
				token,
				...tokens.slice(post_index),
			]
			i = phrase_start
		}
	}

	/**
	 * Create a phrase based on the part-of-speech of the given token, and copy the tags
	 * from the head onto the phrase itself. This will make it easier to check the function
	 * of the phrase.
	 */
	function create_phrase(head_token: Token): Phrase {
		const tag: Tag = {
			phrase_type: get_phrase_type(head_token),
			...head_token.tag,
		}
		return create_token({ token: '', type: TOKEN_TYPE.PHRASE, tag, sub_tokens: [head_token] })
	}

	function get_phrase_type(head_token: Token): string {
		const pos = head_token.lookup_results[0]?.part_of_speech ?? ''
		const type_map: Record<string, string> = {
			Noun: 'NP',
			Verb: 'VP',
			Adjective: 'AdjP',
			Adverb: 'AdvP',
		}
		return type_map[pos] ?? ''
	}

	/**
	 * Using subtokens was helpful for creating the phrases. But for the sake of the structural rules,
	 * it's easier if phrases don't have subtokens and instead are simple opening and closing tokens
	 * surrounding its words, just like in the semantic representation.
	 */
	function flatten_phrases(token: Token): Token[] {
		if (token.type === TOKEN_TYPE.PHRASE) {
			const tags_to_maintain = ['role', 'adj_usage', 'implicit']
			const tag = Object.fromEntries(Object.entries(token.tag).filter(([key]) => tags_to_maintain.includes(key)))
			return [
				create_token({ token: `{${token.tag['phrase_type']}`, type: TOKEN_TYPE.PHRASE, tag }),
				...token.sub_tokens.flatMap(flatten_phrases),
				create_token({ token: '}', type: TOKEN_TYPE.PHRASE }),
			]
		}
		return [token]
	}
}

/**
 * Below are filters used to determine the scope/boundary of each phrase within a clause.
 * The first filter in each row describes the phrase that the other token filters apply to.
 * 	- These are ordered by priority - if a filter matches, none of the others after it are checked.
 * The other token filters describe the possible surrounding tokens that should be included within the associated phrase.
 * 	- These are ordered by position, from closest to the head word to furthest.
 * 	- A filter will try to match as many tokens as possible. When there is no more match, it goes to the next filter.
 * 	- When all filters have been applied, all tokens that were matched are to be included in the phrase.
 * 	- The order matters because of how English phrases are structured. For example, you say 'the red balloon' NOT 'red the balloon'
 */
// Filters for tokens that come before the head word of the phrase
const ORDERED_PHRASE_PRE_FILTERS: Array<[phrase_filter: TokenFilter, token_filters: TokenFilter[]]> = [
	[
		{ 'tag': { 'phrase_type': 'AdvP' } },
		[
			{ 'tag': 'degree' },
			{ 'tag': { 'syntax': 'coord_adv' } },
		],
	],
	[
		{ 'tag': { 'phrase_type': 'AdjP', 'adj_type': 'measure' } },
		[
			// (((10) meters) long)
			{ 'tag': { 'phrase_type': 'NP', 'role': 'adjective_nominal_argument' } },
			{ 'tag': { 'syntax': 'coord_adj' } },
		],
	],
	[
		{ 'tag': { 'phrase_type': 'AdjP' } },
		[
			{ 'tag': 'degree' },
			{ 'tag': { 'syntax': 'coord_adj' } },
		],
	],
	[
		{ 'tag': { 'phrase_type': 'VP' } },
		[
			// should(modal) not(polarity) have(auxiliary) been(auxiliary) going
			// did(auxiliary) not(polarity) start(auxiliary) to(infinitive) go
			// to(infinitive) not(polarity) go
			{ 'tag': 'verb_polarity' },
			{ 'tag': { 'syntax': 'infinitive|gerundifier' } },
			{ 'tag': 'auxiliary' },
			{ 'tag': 'verb_polarity' },
			{ 'tag': 'auxiliary' },
			{ 'tag': 'verb_polarity' },
			{ 'tag': 'modal' },
		],
	],
	[
		// saxon genitives have more limited potential modifiers than regular NPs
		{ 'tag': { 'phrase_type': 'NP', 'relation': 'genitive_saxon' } },
		[
			// [those(determiner) 10(adj) people's] books
			// [John's(saxon) big(adj) book's] pages
			// [the(determiner) gold(made_of) statue's] base
			// [John's(saxon) big(adj) gold(made_of) statue's] base
			// [King(title) David's] house
			{ 'tag': { 'phrase_type': 'NP', 'relation': 'made_of|title' } },
			{ 'tag': { 'phrase_type': 'AdjP', 'adj_usage': 'attributive', 'adj_type': 'regular' } },	// no subgroup type
			{ 'tag': { 'phrase_type': 'NP', 'relation': 'genitive_saxon|group' } },
			{ 'tag': 'determiner' },
		],
	],
	[
		// made_of and title relations cannot be modified
		{ 'tag': { 'phrase_type': 'NP', 'relation': 'made_of|title' } },
		[
			// [the(determiner) gold(made_of) statue's] base
			// [John's(saxon) big(adj) gold(made_of) statue's] base
		],
	],
	[
		{ 'tag': { 'phrase_type': 'NP' } },
		[
			{ 'tag': { 'phrase_type': 'NP', 'relation': 'made_of|title' } },
			{ 'tag': { 'phrase_type': 'AdjP', 'adj_usage': 'attributive', 'adj_type': 'regular' } },	// no subgroup type
			{ 'tag': { 'phrase_type': 'NP', 'relation': 'genitive_saxon|group' } },
			{ 'tag': 'determiner' },
			{ 'tag': { 'phrase_type': 'AdjP', 'relation': 'subgroup' } },
			{ 'tag': 'pre_np_adposition' },
			{ 'tag': { 'syntax': 'coord_noun' } },
		],
	],
].map(entry => parse_phrase_filter(entry as [TokenFilterJson, TokenFilterJson[]]))

// Filters for tokens that come after the head word of the phrase
const ORDERED_PHRASE_POST_FILTERS: Array<[phrase_filter: TokenFilter, token_filters: TokenFilter[]]> = [
	[
		{ 'tag': { 'phrase_type': 'AdjP', 'adj_type': 'subgroup' } },
		[
			{ 'type': TOKEN_TYPE.FUNCTION_WORD, 'tag': { 'relation': 'subgroup' } },	// ((all of) X)
		],
	],
	[
		// only predicative adjectives can take arguments
		{ 'tag': { 'phrase_type': 'AdjP', 'adj_usage': 'predicative' } },
		[
			{ 'tag': { 'phrase_type': 'NP', 'role': 'adjective_nominal_argument' } }, // (kind (to X))
			{ 'tag': { 'phrase_type': 'NP', 'syntax': 'comparative_np' } }, // (bigger (than X))
			{ 'tag': { 'role': 'adjective_clausal_argument' } },	// (able [to...])
		],
	],
	[
		{ 'tag': { 'phrase_type': 'NP' } },
		[
			{ 'tag': { 'phrase_type': 'NP', 'relation': 'genitive_norman|name' } },
			{ 'type': TOKEN_TYPE.FUNCTION_WORD, 'tag': { 'relation': 'group' } },
			{ 'tag': { 'phrase_type': 'NP', 'role': 'noun_argument_np' } },
			{ 'tag': { 'clause_type': 'relative_clause' } },
			{ 'tag': 'post_np_adposition' },	// ((X) years ago)
		],
	],
	[
		{ 'tag': { 'phrase_type': 'VP' } },
		[
			// (was not(polarity)) happy
			{ 'tag': 'verb_polarity' },
		],
	],
].map(entry => parse_phrase_filter(entry as [TokenFilterJson, TokenFilterJson[]]))

function parse_phrase_filter([phrase_filter_json, token_filters_json]: [TokenFilterJson, TokenFilterJson[]]): [TokenFilter, TokenFilter[]] {
	return [
		create_token_filter(phrase_filter_json),
		token_filters_json.map(create_token_filter),
	]
}
