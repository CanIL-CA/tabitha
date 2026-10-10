import { TOKEN_TYPE, create_token, token_has_tag } from '#lib/token.js'
import { REGEXES } from '#lib/regexes.js'
import { create_context_filter, create_token_filter, from_built_in_rule, simple_rule_action } from '#lib/rules/rules_parser.js'
import type { Token } from '#lib/types.js'
import type { BuiltInRule, TokenFilter } from '#lib/rules/types.js'

const structural_rules_json: BuiltInRule[] = [
	{
		name: 'Imperatives',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'token': '(imp)' }),
			context: create_context_filter({
				'precededby': { 'tag': { 'pronoun': 'second_person' } },
			}),
			action: ({ tokens, trigger_index, context_indexes }) => {
				fix_capitalization({ old_tokens: [tokens[context_indexes[0]]], new_tokens: tokens.slice(trigger_index) })

				tokens.splice(trigger_index, 1)	// remove the (imp)
				tokens.splice(context_indexes[0], 1)	// remove the You()
				return trigger_index - 1	// remove 2 tokens and move forward one
			},
		},
	},
	{
		name: 'Suggestive lets',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'token': '_suggestiveLets' }),
			context: create_context_filter({
				'precededby': { 'tag': { 'pronoun': 'first_person' }, 'skip': 'all' },
			}),
			action: ({ tokens, trigger_index, context_indexes }) => {
				const subject = tokens[context_indexes[0]]
				if (!subject.pronoun) {
					return trigger_index + 1
				}
				subject.pronoun.token = token_has_tag({ token: subject, tag_to_check: { 'position': 'first_word' } }) ? "Let's" : "let's"

				return trigger_index + 1
			},
		},
	},
	{
		name: 'Jussive',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'token': '(jussive)' }),
			context: create_context_filter({
				'precededby': { 'tag': { 'position': 'first_word' }, 'skip': 'all' },
			}),
			action: ({ tokens, trigger_index, context_indexes }) => {
				const first_word = tokens[context_indexes[0]]
				const first_is_conjunction = first_word.lookup_results[0]?.part_of_speech === 'Conjunction'
				const let_position = first_is_conjunction ? context_indexes[0] + 1 : context_indexes[0]
				
				const let_token = create_token({ token: 'let', type: TOKEN_TYPE.FUNCTION_WORD })
				const jussive_token = tokens.splice(trigger_index, 1)[0]

				tokens.splice(let_position, 0, let_token, jussive_token)
				
				if (!first_is_conjunction) {
					fix_capitalization({ old_tokens: [first_word], new_tokens: [let_token], decapitalize: true })
				}

				return trigger_index + 2	// removed 1 and inserted 2
			},
		},
	},
	{
		name: 'insert "that" into some "patient_clause_different_participant" clauses',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'patient_clause_different_participant' } }),
			context: create_context_filter({
				// Some specific verbs (eg. let-A) do not take 'that', and cannot be determined with the filters below
				'notprecededby': { 'stem': 'let', 'category': 'Verb' },
			}),
			action: simple_rule_action(({ trigger_token }) => {
				// Don't add 'that' if the patient clause is like 'John heard [Mary speaking].'
				if (token_has_tag({ token: trigger_token, tag_to_check: { 'clause_type': 'patient_clause_simultaneous' } })) {
					return
				}

				// Don't add 'that' if the patient clause includes:
				//   an infinitive 'to' (eg. ask-C)
				//   a complementizer (eg. 'about' for argue-B, 'if' for ask-F)
				//   a gerundifier (eg. 'from' for prevent-A, 'for' for forgive-D)
				if (trigger_token.sub_tokens.some(create_token_filter({ 'tag': { 'syntax': 'infinitive|gerundifier|complementizer' } }))) {
					return
				}

				const that_index = get_index_for_that()
				trigger_token.sub_tokens.splice(that_index, 0, create_token({ token: 'that', type: TOKEN_TYPE.FUNCTION_WORD }))

				function get_index_for_that() {
					// Put the 'that' after a conjunction, if present. eg 'X knows that Y and that Z.'

					const first_word_index = trigger_token.sub_tokens.findIndex(create_token_filter({ 'type': TOKEN_TYPE.LOOKUP_WORD }))
					if (first_word_index !== -1 && create_token_filter({ 'category': 'Conjunction' })(trigger_token.sub_tokens[first_word_index])) {
						return first_word_index + 1
					} else {
						return 1
					}
				}
			}),
		},
	},
	{
		name: 'insert "that" into some agent clauses',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'agent_clause' } }),
			context: create_context_filter({
				// only agent clauses preceded by the agentive 'it' (eg. It is true [John saw Mary])
				'precededby': { 'tag': { 'syntax': 'agent_proposition_subject' }, 'skip': 'all' },
			}),
			action: simple_rule_action(({ trigger_token }) => {
				const that_index = get_index_for_that()
				trigger_token.sub_tokens.splice(that_index, 0, create_token({ token: 'that', type: TOKEN_TYPE.FUNCTION_WORD }))

				function get_index_for_that() {
					// Put the 'that' after a conjunction, if present. eg 'It is true that Y and that Z.'
					const first_word_index = trigger_token.sub_tokens.findIndex(create_token_filter({ 'type': TOKEN_TYPE.LOOKUP_WORD }))
					if (first_word_index !== -1 && create_token_filter({ 'category': 'Conjunction' })(trigger_token.sub_tokens[first_word_index])) {
						return first_word_index + 1
					} else {
						return 1
					}
				}
			}),
		},
	},
	{
		name: 'Add commas around descriptive relative clauses',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'relative_clause': 'descriptive' } }),
			context: create_context_filter({ }),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.sub_tokens = [
					create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION }),
					...trigger_token.sub_tokens,
					create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION }),
				]
			}),
		},
	},
	{
		name: 'Add a trailing comma for an adverbial clause that starts a sentence',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'adverbial_clause' } }),
			context: create_context_filter({ 'subtokens': { 'tag': { 'position': 'first_word' }, 'skip': 'all' } }),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.sub_tokens = [
					...trigger_token.sub_tokens,
					create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION }),
				]
			}),
		},
	},
	{
		name: 'Add a trailing comma for an adverbial clause that starts a sentence but follows a conjunction',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'adverbial_clause' } }),
			context: create_context_filter({ 'precededby': { 'category': 'Conjunction', 'tag': { 'position': 'first_word' } } }),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.sub_tokens = [
					...trigger_token.sub_tokens,
					create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION }),
				]
			}),
		},
	},
	{
		name: 'Change "tribe//region//city//town//country//place named Y" -> "X of Y"',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'relation': 'name' } }),
			context: create_context_filter({
				'precededby': { 'stem': 'tribe|region|city|town|country' },
			}),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.token = 'of'
			}),
		},
	},
	{
		name: 'Move relative clauses to the end of a Noun Phrase',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'token': '{NP' }),
			context: create_context_filter({ }),
			action: simple_rule_action(({ tokens, trigger_index }) => {
				const is_relative_clause = create_token_filter({ 'tag': { 'clause_type': 'relative_clause' } })
				const relative_clauses = find_tokens_within_phrase({ start_index: trigger_index, tokens, filter: is_relative_clause })
					.reverse()	// need to reverse so that the indexes don't get affected
					.flatMap(i => tokens.splice(i, 1))
					.reverse()	// reverse again so they get inserted in the right order

				const phrase_end = find_phrase_end({ tokens, start_index: trigger_index })

				tokens.splice(phrase_end, 0, ...relative_clauses)
			}),
		},
	},
	{
		name: 'Explain name',
		comment: 'The noun phrases get switched around. eg "...at Baal-Peor named a place _explainName" -> "at <<a place named>> Baal-Peor',
		rule: {
			trigger: create_token_filter({ 'token': '_explainName|_implicitExplainName' }),
			context: create_context_filter({
				'precededby': [
					{ 'type': TOKEN_TYPE.LOOKUP_WORD },	// don't expect a Noun here because the name might not be in the Ontology
					{ 'tag': { 'relation': 'name' }, 'skip': 'np' },
				],
			}),
			action: ({ tokens, trigger_index, context_indexes }) => {
				const [proper_name_index, named_index] = context_indexes

				// eg: {NP at Baal-Peor {NP named a place _explainName } } => {NP at <<{NP a place _explainName named }>> Baal-Peor }

				// move 'named' to the end of the inner phrase and add the implicit markers
				const named_phrase_start = find_phrase_start({ tokens, start_index: named_index })
				const named_phrase_end = find_phrase_end({ tokens, start_index: named_index })
				const new_implicit_phrase = [
					create_token({ token: '<<', type: TOKEN_TYPE.PUNCTUATION }),
					...tokens.slice(named_phrase_start, named_index),
					...tokens.slice(named_index + 1, named_phrase_end),
					tokens[named_index],
					tokens[named_phrase_end],
					create_token({ token: '>>', type: TOKEN_TYPE.PUNCTUATION }),
				]

				const outer_phrase = tokens.slice(proper_name_index, named_phrase_start)

				fix_capitalization({ old_tokens: outer_phrase, new_tokens: new_implicit_phrase })

				// insert the new implicit phrase right before the proper noun
				tokens.splice(proper_name_index, named_phrase_end - proper_name_index + 1, ...[
					...new_implicit_phrase,
					...outer_phrase,
				])

				return trigger_index + 3	// add 2 and move forward 1
			},
		},
	},
	{
		name: 'Literal and dynamic expansion and metonymy',
		comment: 'The noun phrases get switched around. eg "The Lord of the eyes _literalExpansion..." -> "{The eyes of} the Lord...',
		rule: {
			trigger: create_token_filter({ 'token': '_literalExpansion|_dynamicExpansion|_metonymy' }),
			context: create_context_filter({
				'precededby': [
					{ 'category': 'Noun', 'skip': 'np_modifiers' },
					{ 'token': 'of', 'skip': 'np' },
				],
			}),
			action: ({ tokens, trigger_index, context_indexes }) => {
				const [outer_noun_index, of_index] = context_indexes
				const is_literal = tokens[trigger_index].token === '_literalExpansion'

				// eg: {NP by the Lord {NP of the eyes _literalExpansion } } => {NP by '{' {NP the eyes _literalExpansion of } '}'  the Lord }
				// eg: {NP {NP King } Herod {NP of the soldiers _dynamicExpansion } } => {NP <<{NP The soldiers _dynamicExpansion of }>> {NP king } Herod }

				// move 'of' to the end of the inner phrase and add the implicit markers
				const inner_phrase_start = find_phrase_start({ tokens, start_index: of_index })
				const inner_phrase_end = find_phrase_end({ tokens, start_index: of_index })

				if (inner_phrase_start === -1 || inner_phrase_end === -1) {
					// the 'of' was found outside an NP, and continuing may cause errors
					return trigger_index + 1
				}

				const new_inner_phrase = [
					create_token({ token: is_literal ? '{' : '<<', type: TOKEN_TYPE.PUNCTUATION }),
					...tokens.slice(inner_phrase_start, of_index),
					...tokens.slice(of_index + 1, inner_phrase_end),
					tokens[of_index],
					tokens[inner_phrase_end],
					create_token({ token: is_literal ? '}' : '>>', type: TOKEN_TYPE.PUNCTUATION }),
				]

				// for the outer noun, don't include any adposition or conjunction
				let outer_phrase_start = find_phrase_start({ tokens, start_index: outer_noun_index }) + 1	// +1 to exclude the phrase boundary itself
				const skip_filter = create_token_filter({ 'tag': [{ 'syntax': 'coord_noun' }, 'pre_np_adposition'] })
				while (skip_filter(tokens[outer_phrase_start])) {
					outer_phrase_start += 1
				}
				const outer_phrase = tokens.slice(outer_phrase_start, inner_phrase_start)

				fix_capitalization({ old_tokens: outer_phrase, new_tokens: new_inner_phrase, decapitalize: true })

				tokens.splice(outer_phrase_start, inner_phrase_end - outer_phrase_start + 1, ...[
					...new_inner_phrase,
					...outer_phrase,
				])

				return trigger_index + (is_literal ? 1 : 3)	// add 2 and move forward 1
			},
		},
	},
	{
		name: 'Add <<>> around implicit clauses',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'type': TOKEN_TYPE.CLAUSE }),
			context: create_context_filter({
				'subtokens': {
					'token': '(implicit-situational)|(implicit-background)|(implicit-subaction)|(implicit-cultural)|(implicit-historical)',
					'skip': 'all',
				},
			}),
			action: simple_rule_action(({ trigger_token, subtoken_indexes }) => {
				trigger_token.sub_tokens = [
					create_token({ token: '<<', type: TOKEN_TYPE.PUNCTUATION }),
					...trigger_token.sub_tokens.slice(0, subtoken_indexes[0]),
					...trigger_token.sub_tokens.slice(subtoken_indexes[0] + 1),
					create_token({ token: '>>', type: TOKEN_TYPE.PUNCTUATION }),
				]
			}),
		},
	},
	{
		name: 'Add <<>> around implicit phrases',
		comment: 'Include any note containing "implicit"',
		rule: {
			trigger: ({ token }) => token.startsWith('_') && token.toLowerCase().includes('implicit'),
			context: create_context_filter({ }),
			action: ({ tokens, trigger_index }) => {
				let phrase_start = find_phrase_start({ tokens, start_index: trigger_index })
				let phrase_end = find_phrase_end({ tokens, start_index: trigger_index })

				if (phrase_start === -1 || phrase_end === -1) {
					// there is no phrase, so surround only the preceding word
					phrase_start = trigger_index - 1
					phrase_end = trigger_index
				}

				const is_necessary = tokens[trigger_index].token.toLowerCase().includes('necessary')
				tokens.splice(phrase_end + 1, 0, create_token({ token: is_necessary ? '>' : '>>', type: TOKEN_TYPE.PUNCTUATION }))
				tokens.splice(phrase_start, 0, create_token({ token: is_necessary ? '<' : '<<', type: TOKEN_TYPE.PUNCTUATION }))
				return trigger_index + 2	// add 1 behind and move forward 1
			},
		},
	},
	{
		name: "God's book (says) -> the Scriptures (say)",
		comment: '',
		rule: {
			trigger: create_token_filter({ 'token': 'book' }),
			context: create_context_filter({ 'precededby': { 'token': "God's" } }),
			action: simple_rule_action(({ tokens, trigger_index, context_indexes }) => {
				const new_tokens = [
					create_token({ token: is_first_word(tokens[context_indexes[0]]) ? 'The' : 'the', type: TOKEN_TYPE.FUNCTION_WORD }),
					create_token({ token: 'Scriptures', type: TOKEN_TYPE.LOOKUP_WORD }),
				]
				const inner_phrase_start = find_phrase_start({ tokens, start_index: context_indexes[0] })
				tokens.splice(inner_phrase_start, trigger_index - inner_phrase_start + 1, ...new_tokens)

				// If the next word is a verb, change it from singular to plural
				const next_word = find_next_word({ tokens, start_index: trigger_index })
				if (next_word?.token === 'says') {
					next_word.token = 'say'
				}
			}),
		},
	},
	{
		name: 'Yahweh -> the LORD',
		comment: "Need to handle cases like 'Yahweh's' and 'you(Yahweh)'",
		rule: {
			trigger: token => token.token.startsWith('Yahweh'),
			context: create_context_filter({ }),
			action: simple_rule_action(({ trigger_token }) => {
				const new_token = is_first_word(trigger_token) ? 'The LORD' : 'the LORD'
				trigger_token.token = trigger_token.token.replace('Yahweh', new_token)
			}),
		},
	},
	{
		name: 'Capitalize the pairing if it is the first word in a sentence.',
		comment: '',
		rule: {
			trigger: token => is_first_word(token) && !!token.pairing,
			context: create_context_filter({ }),
			action: simple_rule_action(({ trigger_token }) => {
				if (!trigger_token.pairing) {
					// makes the compiler happy, but this should never happen
					return
				}
				trigger_token.pairing.token = capitalize_token(trigger_token.pairing)
			}),
		},
	},
	{
		name: 'Expand out dynamic|literal pairings into two sentences.',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'main_clause' } }),
			context: create_context_filter({ }),
			action: ({ tokens, trigger_index, trigger_token }) => {
				// Check if there is a dynamic|literal pairing anywhere within the sentence
				if (!has_literal_pairing(trigger_token.sub_tokens)) {
					return trigger_index + 1
				}

				// duplicate the entire sentence. The literal sentence is inserted before the dynamic one
				const dynamic_sentence = trigger_token
				const literal_sentence = { ...dynamic_sentence, sub_tokens: with_literal_pairing(dynamic_sentence.sub_tokens) }
				tokens.splice(trigger_index, 0, literal_sentence)

				// Add the appropriate (literal) and (dynamic) notes at the start of each sentence
				dynamic_sentence.sub_tokens.splice(0, 0, create_token({ token: '(dynamic)', type: TOKEN_TYPE.NOTE }))
				literal_sentence.sub_tokens.splice(0, 0, create_token({ token: '(literal)', type: TOKEN_TYPE.NOTE }))

				return trigger_index + 2	// move past both sentences

				function has_literal_pairing(clause_tokens: Token[]): boolean {
					for (let i = 0; i < clause_tokens.length; i++) {
						const token = clause_tokens[i]
						if (token.pairing_type === 'dynamic-literal') {
							return true
						}
						if (token.sub_tokens.length > 0) {
							return has_literal_pairing(token.sub_tokens)
						}
					}
					return false
				}

				function with_literal_pairing(clause_tokens: Token[]): Token[] {
					const new_tokens = [...clause_tokens]
					for (let i = 0; i < new_tokens.length; i++) {
						const token = new_tokens[i]
						if (token.pairing && token.pairing_type === 'dynamic-literal') {
							// switch the pairing around
							const literal_token = { ...token.pairing }
							literal_token.pairing = { ...token, pairing: null }
							new_tokens[i] = literal_token
						} else if (token.sub_tokens.length > 0) {
							new_tokens[i] = { ...token, sub_tokens: with_literal_pairing(token.sub_tokens) }
						}
					}
					return new_tokens
				}
			},
		},
	},
	{
		name: 'Simple text mappings',
		comment: '',
		rule: {
			trigger: token => TOKEN_TEXT_MAP.has(token.token),
			context: create_context_filter({ }),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.token = TOKEN_TEXT_MAP.get(trigger_token.token) ?? trigger_token.token
			}),
		},
	},
	{
		name: 'Simple number text mappings',
		comment: 'Change some numbers to text (eg. 2 -> two), unless they are part of a verse reference (eg. Habakkuk 2:3)',
		rule: {
			trigger: token => NUMBER_TOKEN_TEXT_MAP.has(token.token) && !token_has_tag({ token, tag_to_check: { 'role': 'verse_ref' } }),
			context: create_context_filter({ }),
			action: simple_rule_action(({ trigger_token }) => {
				trigger_token.token = NUMBER_TOKEN_TEXT_MAP.get(trigger_token.token) ?? trigger_token.token
			}),
		},
	},
]

const TOKEN_TEXT_MAP = new Map([
	['_paragraph', '(paragraph)'],
	['(comment-begin)', '('],
	['(begin-comment)', '('],
	['(comment-end)', ')'],
	['(end-comment)', ')'],
])

const NUMBER_TOKEN_TEXT_MAP = new Map([
	['2', 'two'],
	['3', 'three'],
	['4', 'four'],
	['5', 'five'],
	['.1', '0.1'],
	['.2', '0.2'],
	['.5', 'half'],
	['.8', '0.8'],
])

function find_phrase_start({ tokens, start_index }: { tokens: Token[]; start_index: number }): number {
	for (let i = start_index - 1; i >= 0; i--) {
		const token = tokens[i]
		if (is_opening_phrase(token)) {
			return i
		} else if (is_closing_phrase(token)) {
			i = find_phrase_start({ tokens, start_index: i })
		}
	}
	return -1
}

function find_phrase_end({ tokens, start_index }: { tokens: Token[]; start_index: number }): number {
	for (let i = start_index + 1; i < tokens.length; i++) {
		const token = tokens[i]
		if (is_closing_phrase(token)) {
			return i
		} else if (is_opening_phrase(token)) {
			i = find_phrase_end({ tokens, start_index: i })
		}
	}
	return -1
}

function is_opening_phrase(token: Token): boolean {
	return token.token.startsWith('{')
}

function is_closing_phrase(token: Token): boolean {
	return token.token === '}'
}

function find_next_word({ tokens, start_index }: { tokens: Token[]; start_index: number }): Token | undefined {
	// Find the next word in the sentence (skip any notes, phrases, or implicit markers)
	const skip_filters = [
		create_token_filter({ 'type': `${TOKEN_TYPE.NOTE}|${TOKEN_TYPE.PHRASE}` }),
		create_token_filter({ 'token': '<<|>>|<|>|{|}' }),
	]
	return tokens.slice(start_index).find(token => !skip_filters.some(filter => filter(token)))
}

/**
 * Finds all the arguments that match one of the given filters, and adds it to the context arguments object according to the provided 
 * key and value getters. The argument is always at the top level within the phrase or clause located at the provided start_index.
 */
function find_tokens_within_phrase({ start_index, tokens, filter }: { start_index: number; tokens: Token[]; filter: TokenFilter }): number[] {
	const matched_indexes: number[] = []
	for (let i = start_index + 1; i < tokens.length; i++) {
		const token = tokens[i]

		if (filter(token)) {
			matched_indexes.push(i)
		}

		if (is_opening_phrase(token)) {
			i = find_phrase_end({ tokens, start_index: i })
		} else if (is_closing_phrase(token)) {
			break
		}
	}
	return matched_indexes
}

function fix_capitalization({ old_tokens, new_tokens, decapitalize = false }: { old_tokens: Token[]; new_tokens: Token[]; decapitalize?: boolean }) {
	const old_first_word = find_next_word({ tokens: old_tokens, start_index: 0 })
	if (!old_first_word || !is_first_word(old_first_word)) {
		return
	}

	if (decapitalize) {
		old_first_word.token = decapitalize_token(old_first_word)
	}

	const new_first_word = find_next_word({ tokens: new_tokens, start_index: 0 })
	if (new_first_word) {
		new_first_word.token = capitalize_token(new_first_word)
		if (new_first_word.pairing) {
			new_first_word.pairing.token = capitalize_token(new_first_word.pairing)
		}
	}

	function decapitalize_token(token: Token): string {
		if (create_token_filter({ 'level': '4' })(token)) {
			return token.token
		}
		return `${token.token[0].toLowerCase()}${token.token.slice(1)}`
	}
}

function capitalize_token({ token }: Token): string {
	if (REGEXES.STARTS_LOWERCASE.test(token)) {
		return `${token[0].toUpperCase()}${token.slice(1)}`
	}
	return token
}

function is_first_word(token: Token): boolean {
	return create_token_filter({ 'tag': { 'position': 'first_word' } })(token)
}


export const BT_STRUCTURAL_RULES = structural_rules_json.map(from_built_in_rule('bt_structural'))
