import { create_context_filter, create_token_filter } from '#lib/rules/rules_parser.js'
import type { SourceEntityCategory, EntityFeature, FeatureName, FeatureValue } from '@tabitha/types'
import type { Token } from '#lib/types.js'
import type { TokenRule, TokenRuleJsonBase } from '#lib/rules/types.js'

type FeatureRuleJson = TokenRuleJsonBase | TokenRuleJsonBase[]
type FeatureValueRules = [FeatureValue, TokenRule[]]
type FeatureRules = [FeatureName, FeatureValueRules[]]
type FeatureRulesByCategory = Partial<Record<SourceEntityCategory, FeatureRules[]>>

type FeatureValueRulesJson = [FeatureValue, FeatureRuleJson]
type FeatureRulesJson = [FeatureName, FeatureValueRulesJson[]]
type FeatureRulesByCategoryJson = Partial<Record<SourceEntityCategory, FeatureRulesJson[]>>

const feature_rules_json: FeatureRulesByCategoryJson = {
	'Noun': [
		['Number', [
			['Singular', { }],
			['Plural', {
				'trigger': { 'form': 'plural' },
			}],
			['Singular', {
				'trigger': { 'form': 'stem' },
			}],
			['Plural', {
				'context': { 'followedby': { 'token': '_plural' } },
			}],
			['Dual', {
				'context': { 'followedby': { 'token': '_dual' } },
			}],
		]],
		['Participant Tracking', [
			['Routine', { }],
			['First of Multiple Mentions', {
				'context': { 'precededby': { 'tag': { 'determiner': 'indefinite_article' }, 'skip': 'np_modifiers' } },
			}],
			['Frame Inferable', {
				'context': { 'followedby': { 'token': '_frameInferable' } },
			}],
			['Interrogative', {
				'trigger': { 'tag': { 'noun_tracking': 'interrogative' } },
			}],
		]],
		['Polarity', [
			['Affirmative', { }],
			['Negative', {
				'context': { 'precededby': { 'tag': { 'determiner': 'negative_noun_polarity' }, 'skip': 'np_modifiers' } },
			}],
		]],
		['Proximity', [
			['Not Applicable', { }],
			['Contextually Near with Focus', {
				'context': { 'precededby': { 'tag': { 'determiner': 'near_demonstrative' }, 'skip': 'np_modifiers' } },
			}],
			['Contextually Near', {
				'context': { 'precededby': { 'tag': { 'determiner': 'remote_demonstrative' }, 'skip': 'np_modifiers' } },
			}],
		]],
		['Specificity', [
			['Specific', { }],
			['Non-specific', {
				'trigger': { 'tag': { 'specificity': 'non_specific' } },
			}],
			['Not Applicable', {
				'trigger': { 'tag': { 'specificity': 'not_applicable' } },
			}],
			['Generic', {
				'context': { 'followedby': { 'token': '_generic' } },
			}],
		]],
		['Person', [
			['Third', { }],
			['First', {
				'trigger': { 'tag': { 'pronoun': 'first_person' } },
			}],
			['Second', {
				'trigger': { 'tag': { 'pronoun': 'second_person' } },
			}],
			['First Inclusive', {
				'trigger': { 'tag': { 'pronoun': 'first_person&plural' } },
			}],
			['First Exclusive', {
				'trigger': { 'tag': { 'pronoun': 'first_person&plural' } },
				'context': { 'followedby': { 'token': '_excl|_exclusive' } },
			}],
		]],
		['Participant Status', [
			['Not Applicable', { }],
			['Emphasized', {
				'context': { 'followedby': { 'token': '_emphasized' } },
			}],
		]],
	],
	'Verb': [
		['Time', [
			['Present', { }],
			['Present', [
				{ 'trigger': { 'tag': { 'time': 'present' } } },
				{ 'context': { 'precededby': { 'tag': { 'time': 'present' }, 'skip': 'all' } } },
			]],
			['Discourse', [
				{ 'trigger': { 'tag': { 'time': 'past' } } },
				{ 'context': { 'precededby': { 'tag': { 'time': 'past' }, 'skip': 'all' } } },
			]],
			['Immediate Future', [
				{ 'context': { 'precededby': { 'tag': { 'time': 'future' }, 'skip': 'all' } } },
				{ 'context': { 'precededby': { 'token': '(imp)|_jussive|(jussive)|_suggestiveLets|(suggestivelets)', 'skip': 'all' } } },
				{ 'context': { 'followedby': { 'token': '(imp)|_jussive|(jussive)|_suggestiveLets|(suggestivelets)', 'skip': 'all' } } },
			]],
		]],
		['Aspect', [
			['Unmarked', { }],
			['Inceptive', {
				'context': { 'precededby': { 'tag': { 'auxiliary': 'inceptive_aspect' }, 'skip': 'all' } },
			}],
			['Completive', {
				'context': { 'precededby': { 'tag': { 'auxiliary': 'completive_aspect' }, 'skip': 'all' } },
			}],
			['Cessative', {
				'context': { 'precededby': { 'tag': { 'auxiliary': 'cessative_aspect' }, 'skip': 'all' } },
			}],
			['Continuative', {
				'context': { 'precededby': { 'tag': { 'auxiliary': 'continuative_aspect' }, 'skip': 'all' } },
			}],
			['Imperfective', {
				'trigger': { 'tag': { 'auxiliary': 'imperfective_aspect' } },
				'context': { 'precededby': { 'tag': { 'time': 'present' }, 'skip': 'all' } },
			}],
			['Routine', {
				'context': { 'followedby': { 'token': '_routine' } },
			}],
		]],
		['Mood', [
			['Indicative', { }],
			['Definite Potential', {
				'context': { 'precededby': { 'tag': { 'modal': 'definite_mood' }, 'skip': 'all' } },
			}],
			['Probable Potential', {
				'context': { 'precededby': { 'tag': { 'modal': 'probable_mood' }, 'skip': 'all' } },
			}],
			["'might' Potential", {
				'context': { 'precededby': { 'tag': { 'modal': 'might_mood' }, 'skip': 'all' } },
			}],
			["'must' Obligation", {
				'context': { 'precededby': { 'tag': { 'modal': 'must_mood' }, 'skip': 'all' } },
			}],
			["'should' Obligation", {
				'context': { 'precededby': { 'tag': { 'modal': 'should_mood' }, 'skip': 'all' } },
			}],
			["'may' (permissive)", {
				'context': { 'precededby': { 'tag': { 'modal': 'may_permissive_mood' }, 'skip': 'all' } },
			}],
		]],
		['Reflexivity', [
			['Not Applicable', { }],
			['Reciprocal', {
				'context': { 'followedby': { 'tag': { 'pronoun': 'reciprocal' }, 'skip': 'all' } },
			}],
			['Reflexivity', [
				{ 'context': { 'followedby': { 'tag': { 'pronoun': 'reflexive' }, 'skip': 'all' } } },
				{ 'context': { 'followedby': { 'token': '_reflexive', 'skip': 'all' } } },
			]],
		]],
		['Polarity', [
			['Affirmative', { }],
			['Negative', [
				{ 'context': { 'precededby': { 'tag': { 'verb_polarity': 'negative' }, 'skip': 'all' } } },
				{ 'context': { 'followedby': { 'tag': { 'verb_polarity': 'negative' }, 'skip': 'all' } } },
			]],
		]],
	],
	'Adjective': [
		['Degree', [
			['No Degree', { }],
			['Comparative', [
				{ 'context': { 'precededby': { 'tag': { 'degree': 'comparative' }, 'skip': 'adjp_modifiers_predicative' } } },
				{ 'trigger': { 'form': 'comparative' } },
			]],
			['Superlative', [
				{ 'context': { 'precededby': { 'tag': { 'degree': 'superlative' }, 'skip': 'adjp_modifiers_predicative' } } },
				{ 'trigger': { 'form': 'superlative' } },
			]],
			['Intensified', {
				'context': { 'precededby': { 'tag': { 'degree': 'intensified' }, 'skip': 'adjp_modifiers_predicative' } },
			}],
			['Extremely Intensified', {
				'context': { 'precededby': { 'tag': { 'degree': 'extremely_intensified' }, 'skip': 'adjp_modifiers_predicative' } },
			}],
			["'too'", {
				'context': { 'precededby': { 'tag': { 'degree': 'too' }, 'skip': 'adjp_modifiers_predicative' } },
			}],
			["'less'", {
				'context': { 'precededby': { 'tag': { 'degree': 'less' }, 'skip': 'adjp_modifiers_predicative' } },
			}],
			["'least'", {
				'context': { 'precededby': { 'tag': { 'degree': 'least' }, 'skip': 'adjp_modifiers_predicative' } },
			}],
			['Equality', {
				'context': { 'precededby': { 'tag': { 'degree': 'equality' }, 'skip': 'adjp_modifiers_predicative' } },
			}],
		]],
	],
	'Adverb': [
		['Degree', [
			['No Degree', { }],
			['Comparative', [
				{ 'context': { 'precededby': { 'tag': { 'degree': 'comparative' } } } },
				{ 'trigger': { 'form': 'comparative' } },
			]],
			['Superlative', [
				{ 'context': { 'precededby': { 'tag': { 'degree': 'superlative' } } } },
				{ 'trigger': { 'form': 'superlative' } },
			]],
			['Intensified', {
				'context': { 'precededby': { 'tag': { 'degree': 'intensified' } } },
			}],
			['Extremely Intensified', {
				'context': { 'precededby': { 'tag': { 'degree': 'extremely_intensified' } } },
			}],
			["'too'", {
				'context': { 'precededby': { 'tag': { 'degree': 'too' } } },
			}],
			["'less'", {
				'context': { 'precededby': { 'tag': { 'degree': 'less' } } },
			}],
			["'least'", {
				'context': { 'precededby': { 'tag': { 'degree': 'least' } } },
			}],
		]],
	],
	'Adposition': [],
	'Conjunction': [
		['Implicit', [
			['Yes', by_tag('implicit')],
		]],
	],
	'Noun Phrase': [
		['Semantic Role', [
			['Not Applicable', { }],	// 'Not Applicable' would not be selected as the 'default' value
			['Most Agent-like', by_tag({ 'role': 'agent' })],
			['Most Patient-like', by_tag({ 'role': 'patient' })],
			['State', by_tag({ 'role': 'state' })],
			['Source', by_tag({ 'role': 'source' })],
			['Destination', by_tag({ 'role': 'destination' })],
			['Instrument', by_tag({ 'role': 'instrument' })],
			['Beneficiary', by_tag({ 'role': 'beneficiary' })],
			['Addressee', by_tag({ 'role': 'addressee' })],
		]],
		['Implicit', [
			['Explanation of Name', by_tag({ 'implicit': 'explain_name' })],
			['Optional Agent of Passive', by_tag({ 'implicit': 'optional_agent_of_passive' })],
			['Implicit Phrase', by_tag({ 'implicit': 'implicit' })],
			['Dynamic Expansion (Metonymy)', by_tag({ 'implicit': 'dynamic_expansion' })],
			['Literal Expansion (Metonymy)', by_tag({ 'implicit': 'literal_expansion' })],
			['Implicit but Necessary', by_tag({ 'implicit': 'implicit_necessary' })],
		]],
	],
	'Verb Phrase': [
		['Implicit', [
			['Yes', by_tag('implicit')],
		]],
	],
	'Adjective Phrase': [
		['Usage', [
			['Predicative', { }],
			['Attributive', by_tag({ 'adj_usage': 'attributive' })],
		]],
		['Implicit', [
			['Yes', by_tag('implicit')],
		]],
	],
	'Adverb Phrase': [
		['Implicit', [
			['Yes', by_tag('implicit')],
		]],
	],
	'Clause': [
		['Type', [
			['Independent', by_tag({ 'clause_type': 'main_clause' })],
			['Restrictive Thing Modifier (Relative Clause)', by_tag({ 'relative_clause': 'restrictive' })],
			['Descriptive Thing Modifier (Relative Clause)', by_tag({ 'relative_clause': 'descriptive' })],
			['Event Modifier (Adverbial Clause)', by_tag({ 'clause_type': 'adverbial_clause' })],
			['Agent (Subject Complement)', by_tag({ 'clause_type': 'agent_clause' })],
			['Patient (Object Complement)', by_tag({ 'clause_type': 'patient_clause_same_participant|patient_clause_different_participant|patient_clause_quote_begin' })],
			['Attributive Patient (Adjectival Object Complement)', by_tag({ 'role': 'adjective_clausal_argument' })],
		]],
		['Illocutionary Force', [
			['Declarative', { }],
			['Imperative', by_subtoken('(imp)')],
			['Content Interrogative', by_tag({ 'interrogative': 'content' })],
			['Yes-No Interrogative', by_tag({ 'interrogative': 'yes-no' })],
			["Suggestive 'let's'", by_subtoken('_suggestiveLets|(suggestivelets)')],
			['Jussive', by_subtoken('_jussive|(jussive)')],
		]],
		['Topic NP', [
			['Most Agent-like', { }],
			['Most Patient-like', by_subtoken_tag({ 'auxiliary': 'passive' })],
		]],
		['Salience Band', [
			['Primary Storyline', { }],
			['Backgrounded Actions', {
				'context': {
					'subtokens': [
						{ 'tag': { 'time': 'past' }, 'skip': 'all' },
						{ 'tag': { 'auxiliary': 'imperfective_aspect' }, 'skip': 'all' },
					],
				},
			}],
			['Flashback', by_subtoken_tag({ 'auxiliary': 'flashback' })],
		]],
		['Implicit Information', [
			['Implicit Cultural Information', by_subtoken('(implicit-cultural)')],
			['Implicit Situational Information', by_subtoken('(implicit-situational)')],
			['Implicit Historical Information', by_subtoken('(implicit-historical)')],
			['Implicit Background Information', by_subtoken('(implicit-background)')],
			['Implicit Subactions', by_subtoken('(implicit-subaction)')],
			['Implicit Argument', by_subtoken('(implicit-argument)')],
		]],
		['Location', [
			['Discourse Title', by_subtoken('(title)')],
			['General Footnote', by_subtoken('(footnote)')],
		]],
		['Alternative Analysis', [
			['Primary Analysis', by_subtoken('(primary)')],
			['First Alternative Analysis', by_subtoken('(alternate-1)')],
			['Second Alternative Analysis', by_subtoken('(alternate-2)')],
			['Third Alternative Analysis', by_subtoken('(alternate-3)')],
			['Fourth Alternative Analysis', by_subtoken('(alternate-4)')],
			['Fifth Alternative Analysis', by_subtoken('(alternate-5)')],
			['Literal Alternate', by_subtoken('(literal)')],
			['Dynamic Alternate', by_subtoken('(dynamic)')],
			['Biblical Units', by_subtoken('(literalunits)')],
			['Contemporary Units', by_subtoken('(modernunits)')],
		]],
		['Vocabulary Alternate', [
			['Single Sentence - Complex Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'complex&single' })],
			['First Sentence - Complex Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'complex&first' })],
			['Last Sentence - Complex Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'complex&last' })],
			['Coordinate Sentence - Complex Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'complex&coordinate' })],
			['Single Sentence - Simple Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'simple&single' })],
			['First Sentence - Simple Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'simple&first' })],
			['Last Sentence - Simple Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'simple&last' })],
			['Coordinate Sentence - Simple Vocabulary Alternate', by_tag({ 'vocabulary_alternate': 'simple&coordinate' })],
		]],
		['Rhetorical Question', [
			['Not Applicable', { }],
			['Content Rhetorical Question', by_subtoken('(rhetorical)')],
			["Yes-No Question Expects 'No'", by_subtoken('(norhetorical)')],
			["Persuasive Yes-No Question Expects 'Yes'", by_subtoken('(yesrhetorical)')],
			['Equivalent Statement', by_subtoken('(statement)')],
		]],
	],
}

function by_subtoken(token: string): FeatureRuleJson {
	return { 'context': { 'subtokens': { token, 'skip': 'all' } } }
}

function by_subtoken_tag(tag: Record<string, string>): FeatureRuleJson {
	return { 'context': { 'subtokens': { tag, 'skip': 'all' } } }
}

function by_tag(tag: Record<string, string> | string): FeatureRuleJson {
	return { 'trigger': { tag } }
}

const FEATURE_RULES_BY_CATEGORY: FeatureRulesByCategory = parse_all_feature_rules()

function parse_all_feature_rules(): FeatureRulesByCategory {
	return Object.fromEntries(
		Object.entries(feature_rules_json).map(([pos, pos_feature_rules_json]) => {
			return [
				pos,
				pos_feature_rules_json.map(([feature_name, feature_values_json]) => {
					return [
						feature_name,
						feature_values_json.map(([feature_value, rule_json]) => {
							return [feature_value, parse_feature_rule_json({ part_of_speech: pos, feature_name, feature_value, rule_json })]
						}),
					]
				}),
			]
		}),
	)

	function parse_feature_rule_json(
		{ part_of_speech, feature_name, feature_value, rule_json }: {
			part_of_speech: string
			feature_name: FeatureName
			feature_value: FeatureValue
			rule_json: FeatureRuleJson
		},
	): TokenRule[] {
		if (Array.isArray(rule_json)) {
			return rule_json.flatMap(json => parse_feature_rule_json({ part_of_speech, feature_name, feature_value, rule_json: json }))
		}

		const trigger = create_token_filter(rule_json['trigger'] || 'all')
		const context = create_context_filter(rule_json['context'])

		return [{
			id: `feature:${part_of_speech}:${feature_name}:${feature_value}`,
			name: '',
			trigger,
			context,
			action: ({ trigger_index }) => trigger_index + 1,
		}]
	}
}

export function get_features_for_token({ tokens, token_index, category }: { tokens: Token[]; token_index: number; category: SourceEntityCategory }): EntityFeature[] {
	const category_feature_rules = FEATURE_RULES_BY_CATEGORY[category] || []
	return category_feature_rules.map(([feature_name, feature_rules]) => {
		const selected_value_rules = feature_rules.findLast(([, rules]) => rules.some(rule => test_feature_rule({ tokens, token_index, rule })))
		return {
			name: feature_name,
			value: selected_value_rules?.[0] || '',
		}
	})
}

function test_feature_rule({ tokens, token_index, rule }: { tokens: Token[]; token_index: number; rule: TokenRule }): boolean {
	return rule.trigger(tokens[token_index]) && rule.context(tokens, token_index).success
}