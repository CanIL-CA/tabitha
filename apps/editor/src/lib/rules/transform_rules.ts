import { add_tag_to_token, TOKEN_TYPE } from '#lib/token.js'
import { create_context_filter, create_token_filter, create_token_transform, create_token_transforms, from_built_in_rule, simple_rule_action } from './rules_parser'
import { IS_CARDINAL_NUMBER } from '@tabitha/types/patterns'
import type { Token, Tag } from '#lib/types.js'
import type {
	BuiltInRule,
	RuleTriggerContext,
	TokenRule,
	TokenTransform,
	TransformRuleJson,
} from '#lib/rules/types.js'

/**
 * These are words that may change their underlying data based on the context around them.
 * These can look at the lookup results of the surrounding tokens (ie syntactic category).
 */
const transform_rules_json: TransformRuleJson[] = [
	// Verb infinitives and forms
	{
		'name': '"to" before a verb gets tagged as infinitive',
		'trigger': { 'token': 'to' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'vp_modifiers' },
		},
		'transform': { 'function': { 'syntax': 'infinitive' } },
	},
	{
		'name': '"from" or "for" before a verb gets tagged as gerundifier',
		'trigger': { 'token': 'from|for' },
		'context': {
			'followedby': {
				'category': 'Verb',
				'form': 'stem|participle',
				'skip': 'vp_modifiers',
			},
		},
		'transform': { 'function': { 'syntax': 'gerundifier' } },
		'comment': '"prevent [X from Ving]", "forgive [X for Ving]". May be needed for other verbs as well',
	},
	{
		'name': 'Mark a Verb with the present form as present',
		'trigger': { 'category': 'Verb', 'form': 'third singular present|present' },
		'context': {},
		'transform': { 'tag': { 'time': 'present' } },
	},
	{
		'name': 'Mark a Verb with the past form as past. And make it a function word',
		'trigger': { 'category': 'Verb', 'form': 'past' },
		'context': {},
		'transform': { 'tag': { 'time': 'past' } },
	},
	// Aspect Auxiliaries
	{
		'name': 'start or begin before a verb becomes a function word',
		'trigger': { 'stem': 'start|begin' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'vp_modifiers' },
		},
		'transform': { 'function': { 'auxiliary': 'inceptive_aspect' } },
		'comment': 'support both "started eating" and "started to eat"',
	},
	{
		'name': 'stop before a verb becomes a function word',
		'trigger': { 'stem': 'stop' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'vp_modifiers' },
		},
		'transform': { 'function': { 'auxiliary': 'cessative_aspect' } },
	},
	{
		'name': 'continue before a verb becomes a function word',
		'trigger': { 'stem': 'continue' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'vp_modifiers' },
		},
		'transform': { 'function': { 'auxiliary': 'continuative_aspect' } },
		'comment': 'support both "continued eating" and "continued to eat"',
	},
	{
		'name': 'finish before a verb becomes a function word',
		'trigger': { 'stem': 'finish' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'vp_modifiers' },
		},
		'transform': { 'function': { 'auxiliary': 'completive_aspect' } },
	},
	// Clause type setting
	{
		'name': 'Set tag for relative clauses and relativizers',
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': {
			'precededby': {
				'category': 'Noun',
				'skip': [{ 'tag': { 'clause_type': 'relative_clause' } }, { 'token': ',' }],
			},
			'subtokens': {
				'tag': { 'syntax': 'relativizer' },
				'skip': [{ 'token': '[' }, { 'category': 'Conjunction' }],
			},
		},
		'transform': { 'tag': { 'clause_type': 'relative_clause' } },
		'subtoken_transform': { 'remove_tag': 'determiner' },
		'comment': 'removes extra tags for words like "who" and "which". clear the determiner tag but keep the syntax one. This also handles coordinate relative clauses.',
	},
	{
		'name': 'Set extra tag for relative clauses that use "that"',
		'trigger': { 'tag': { 'clause_type': 'relative_clause' } },
		'context': {
			'subtokens': {
				'token': 'that',
				'skip': [{ 'token': '[' }, { 'category': 'Conjunction' }],
			},
		},
		'transform': { 'tag': { 'clause_type': 'relative_clause|relative_clause_that' } },
		'comment': 'a later rule needs to know if the relativizer is "that". clear the determiner tag but keep the syntax one',
	},
	{
		'name': 'Revert clause type for a "relative clause" with "that" when it modifies a pronoun',
		'trigger': { 'tag': { 'clause_type': 'relative_clause_that' } },
		'context': {
			'precededby': { 'tag': 'pronoun' },
		},
		'transform': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'comment': '"that" will never be a relativizer when modifying a pronoun (only "who" will be)',
	},
	{
		'name': 'Set tag for "that" when not preceded by a Noun',
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': {
			'notprecededby': { 'category': 'Noun' },
			'subtokens': {
				'token': 'that',
				'skip': [{ 'token': '[' }, { 'category': 'Conjunction' }],
			},
		},
		'subtoken_transform': { 'remove_tag': 'syntax' },
		'comment': '"that" should only be a demonstrative in this case. clear the syntax tag but keep the determiner one',
	},
	{
		'name': 'tag subordinate clauses along with \'it\' as agent clauses',
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': { 'precededby': { 'tag': { 'syntax': 'agent_proposition_subject' }, 'skip': 'all' } },
		'transform': { 'tag': { 'clause_type': 'agent_clause' } },
		'comment': 'Ruth 2:22 It is good that you continue working...',
	},
	{
		'name': 'tag subordinate clauses that directly precede the verb as agent clauses',
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': { 'followedby': { 'category': 'Verb' } },
		'transform': { 'tag': { 'clause_type': 'agent_clause' } },
		'comment': 'It is true that John read that book',
	},
	{
		'name': "tag 'that' relative clauses that occur with 'it' as agent clauses",
		'trigger': { 'tag': { 'clause_type': 'relative_clause_that' } },
		'context': {
			'precededby': { 'tag': { 'syntax': 'agent_proposition_subject' }, 'skip': ['np', 'vp'] },
		},
		'transform': { 'tag': { 'clause_type': 'agent_clause' } },
		'comment': 'It please Mary [that John read this book]. - this was originally tagged as a relative clause but the \'it\' takes priority',
	},
	{
		'name': "tag subordinate clauses starting with the infinitive 'to' as 'same_participant'",
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': { 
			'subtokens': { 'tag': { 'syntax': 'infinitive' }, 'skip': 'clause_start' },
		},
		'transform': { 'tag': { 'clause_type': 'patient_clause_same_participant' } },
		'comment': 'eg John wanted [to sing]',
	},
	{
		'name': "tag subordinate clauses starting with a participle Verb as 'same_participant'",
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': {
			'subtokens': {
				'category': 'Verb',
				'form': 'stem|participle',
				'skip': 'clause_start',
			},
		},
		'transform': { 'tag': { 'clause_type': 'patient_clause_same_participant' } },
		'comment': 'eg John likes [singing]',
	},
	{
		'name': "tag subordinate clauses starting with some adpositions + participle Verb as 'same_participant'",
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': {
			'subtokens': [
				{ 'token': 'of|for|in', 'skip': 'clause_start' },
				{ 'category': 'Verb', 'form': 'stem|participle' },
			],
		},
		'transform': { 'tag': { 'clause_type': 'patient_clause_same_participant' } },
		'subtoken_transform': { 'function': { 'syntax': 'gerundifier' } },
		'comment': 'eg John is guilty [of bad things]. John is interested [in singing].',
	},
	{
		'name': 'tag subordinate clauses where the verb is a participle for see/hear',
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': {
			'precededby': { 'category': 'Verb', 'stem': 'see|hear', 'skip': 'all' },
			'subtokens': {
				'category': 'Verb',
				'form': 'stem|participle',
				'skip': 'all',
			},
		},
		'transform': { 'tag': { 'clause_type': 'patient_clause_simultaneous|patient_clause_different_participant' } },
		'comment': 'eg. "John saw [Mary walking]." This rule should apply before setting "be" as an auxilliary, but after setting the aspect verbs as auxilliaries',
	},
	{
		'name': 'tag subordinate clauses starting with an adposition as adverbial',
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'context': {
			'subtokens': {
				'category': 'Adposition',
				'skip': [{ 'token': '[' }, { 'category': 'Conjunction' }],
			},
		},
		'transform': { 'tag': { 'clause_type': 'adverbial_clause' } },
	},
	{
		'name': 'tag "in-order-to/by/without" clauses as "same subject" adverbial',
		'trigger': { 'tag': { 'clause_type': 'adverbial_clause' } },
		'context': {
			'subtokens': { 'stem': 'in-order-to|by|without', 'skip': 'clause_start' },
		},
		'transform': { 'tag': { 'clause_type': 'adverbial_clause|adverbial_clause_same_subject' } },
	},
	{
		'name': 'any remaining subordinate_clause is a \'different_participant\' patient clause by default',
		'trigger': { 'tag': { 'clause_type': 'subordinate_clause' } },
		'transform': { 'tag': { 'clause_type': 'patient_clause_different_participant' } },
	},
	{
		'name': 'tag all clause arguments with role: "none"',
		'trigger': { 'tag': { 'clause_type': 'patient_clause_different_participant|patient_clause_same_participant|patient_clause_quote_begin|agent_clause' } },
		'transform': { 'tag': { 'role': 'none' } },
		'comment': 'Setting up for the case frame rules',
	},
	{
		'name': 'tag \'that\' at the beginning of a main clause as a determiner when followed by a noun',
		'trigger': { 'token': 'That|that' },
		'context': {
			'notprecededby': { 'token': '[', 'skip': { 'category': 'Conjunction' } },
			'followedby': { 'category': 'Noun', 'skip': 'np_modifiers' },
		},
		'transform': { 'remove_tag': 'syntax' },
		'comment': 'this clears the relativizer tag but keeps the determiner tag',
	},
	{
		'name': 'a relative clause is restrictive by default',
		'trigger': { 'tag': { 'clause_type': 'relative_clause' } },
		'context': { },
		'transform': { 'tag': { 'relative_clause': 'restrictive' } },
	},
	{
		'name': 'tag relative clauses on proper names as descriptive',
		'trigger': { 'tag': { 'clause_type': 'relative_clause' } },
		'context': {
			'precededby': { 'category': 'Noun', 'level': '4' },
		},
		'transform': { 'tag': { 'relative_clause': 'descriptive' } },
	},
	{
		'name': 'tag relative clauses with a _descriptive note as descriptive',
		'trigger': { 'tag': { 'clause_type': 'relative_clause' } },
		'context': {
			'subtokens': { 'token': '_descriptive', 'skip': 'all' },
		},
		'transform': { 'tag': { 'relative_clause': 'descriptive' } },
	},
	// General function words
	{
		'name': '"no" before a noun becomes negative_noun_polarity',
		'trigger': { 'token': 'no' },
		'context': { 'followedby': { 'category': 'Noun', 'skip': 'adjp' } },
		'transform': { 'function': { 'determiner': 'negative_noun_polarity' } },
	},
	{
		'name': '"most" before adjective or adverb becomes a function word',
		'trigger': { 'stem': 'most' },
		'context': {
			'followedby': { 'category': 'Adjective|Adverb' },
		},
		'transform': { 'function': { 'degree': 'superlative' } },
	},
	{
		'name': '"more" before adjective of adverb and "than" becomes a function word',
		'trigger': { 'stem': 'more' },
		'context': {
			'followedby': [{ 'category': 'Adjective|Adverb' }, { 'tag': { 'pre_np_adposition': 'comparative_than' } }],
		},
		'transform': { 'function': { 'degree': 'comparative' } },
		'comment': "eg 'more content than X', etc ",
	},
	{
		'name': '"as" in "as Adj/Adv as..." becomes a function word',
		'trigger': { 'stem': 'as' },
		'context': {
			'followedby': [{ 'category': 'Adjective|Adverb' }, { 'stem': 'as' }],
		},
		'transform': { 'function': { 'degree': 'equality' } },
		'context_transform': [{ }, { 'function': { 'pre_np_adposition': 'comparative_as' } }],
		'comment': "eg 'as valuable as X', etc ",
	},
	// Interrogatives
	{
		'name': '\'who\'/\'what\' gets tagged as interrogative determiner when in a question',
		'trigger': { 'token': 'Who|who|What|what' },
		'context': {
			'followedby': { 'token': '?', 'skip': 'all' },
		},
		'transform': { 'tag': { 'determiner': 'interrogative', 'noun_tracking': 'interrogative' }, 'remove_tag': 'syntax' },
		'comment': '"who/what" becomes "which person-A/thing-A" respectively when in a question. So tag it, but do not make it a function word',
	},
	{
		'name': '"how-much-many" gets tagged with interrogative determiner',
		'trigger': { 'stem': 'how-much-many' },
		'context': {},
		'transform': { 'tag': { 'determiner': 'interrogative' } },
		'comment': '',
	},
	{
		'name': 'tag clauses with "?" as "interrogative: yes-no"',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE },
		'context': {
			'subtokens': { 'token': '?', 'skip': 'all' },
		},
		'transform': { 'tag': { 'interrogative': 'yes-no' } },
	},
	{
		'name': 'interrogatives that have an interrogative determiner are content questions',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'interrogative': 'yes-no' } },
		'context': {
			'subtokens': { 'tag': { 'determiner': 'interrogative' }, 'skip': 'all' },
		},
		'transform': { 'tag': { 'interrogative': 'content' } },
	},
	{
		'name': 'interrogatives that have a question adverb are content questions',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'interrogative': 'yes-no' } },
		'context': {
			'subtokens': { 'stem': 'how-long|how|where|why', 'skip': 'all' },
		},
		'transform': { 'tag': { 'interrogative': 'content' } },
	},
	// Noun-Noun relationships
	{
		'name': '\'named\' before a name and after a Verb becomes a function word',
		'trigger': { 'token': 'named' },
		'context': {
			'precededby': { 'category': 'Verb', 'skip': 'all' },
			'followedby': { 'category': 'Noun', 'skip': 'np_modifiers' },
		},
		'transform': { 'function': { 'relation': 'name', 'pre_np_adposition': 'relation' } },
	},
	{
		'name': '\'named\' before a name and before a Verb becomes a function word',
		'trigger': { 'token': 'named' },
		'context': {
			'followedby': [
				{ 'category': 'Noun', 'skip': 'np_modifiers' },
				{ 'category': 'Verb', 'skip': 'all' },
			],
		},
		'transform': { 'function': { 'relation': 'name', 'pre_np_adposition': 'relation' } },
	},
	{
		'name': '\'of\' after group/crowd becomes a function word',
		'trigger': { 'token': 'of' },
		'context': { 'precededby': { 'stem': 'group|crowd' } },
		'transform': { 'function': { 'relation': 'group' }, 'remove_tag': 'pre_np_adposition' },
	},
	{
		'name': 'certain Noun-Noun combinations are "made_of"',
		'trigger': { 'category': 'Noun', 'stem': 'bamboo|bronze|gold|iron|leather|marble|metal|plastic|silver|wood' },
		'context': { 'followedby': { 'category': 'Noun' } },
		'transform': { 'tag': { 'relation': 'made_of' } },
		'comment': 'eg. a gold statue; a bamboo chair. The Nouns are always right next to each other',
	},
	{
		'name': 'certain Noun-Noun combinations are "title"',
		'trigger': { 'category': 'Noun' },
		'context': {
			'precededby': { 'category': 'Noun', 'stem': 'king|queen|Christ|Caesar|Lord' },
			'notprecededby': { 'tag': 'relation' },
		},
		'context_transform': { 'tag': { 'relation': 'title' } },
		'comment': "eg. King Herod, Lord Jesus, but NOT 'the king's army'",
	},
	// Senses of 'be'
	{
		'name': 'Tag \'there\' before \'be\' as existential',
		'trigger': { 'token': 'There|there' },
		'context': {
			'followedby': { 'stem': 'be', 'skip': 'vp_modifiers' },
		},
		'transform': { 'function': { 'syntax': 'existential' } },
		'comment': 'We have to keep this as a transform rule so we can handle the "there" properly.',
	},
	{
		'name': "'part' and 'like' after 'be' become function words",
		'trigger': { 'token': 'part|like' },
		'context': {
			'precededby': { 'stem': 'be', 'skip': 'vp_modifiers' },
		},
		'transform': { 'function': {} },
		'comment': "Since 'part' and 'like' are also words in the Ontology, this ensures the clause is interpreted correctly",
	},
	{
		'name': '\'made of\' after \'be\' becomes a function word',
		'trigger': { 'token': 'made' },
		'context': {
			'precededby': { 'stem': 'be', 'skip': 'vp_modifiers' },
			'followedby': { 'token': 'of' },
		},
		'transform': { 'function': {} },
		'comment': 'The Analyzer always fully deletes the phrase "made of", but we can be more specific',
	},
	// Other Verb auxiliaries
	{
		'name': 'do with not becomes an auxiliary',
		'trigger': { 'stem': 'do' },
		'context': {
			'followedby': { 'token': 'not' },
		},
		'transform': { 'function': { 'auxiliary': 'negation' } },
	},
	{
		'name': 'do followed by another verb is an interrogative auxiliary',
		'trigger': { 'stem': 'do' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'all' },
		},
		'transform': { 'function': { 'auxiliary': 'interrogative' } },
		'comment': 'removed the question mark from the context, because the punctuation may be outside the closing clause bracket',
	},
	{
		'name': 'have before a Verb indicates flashback/perfect',
		'trigger': { 'stem': 'have' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'all' },
		},
		'transform': { 'function': { 'auxiliary': 'flashback', 'time': 'past' } },
		'comment': 'don\'t check for the perfect form because of cases like "have cry-out". The perfect is always indicative of the past in TBTA',
	},
	{
		'name': 'be before a participle Verb indicates imperfective',
		'trigger': { 'stem': 'be' },
		'context': {
			'followedby': {
				'category': 'Verb',
				'form': 'participle',
				'skip': 'all',
			},
		},
		'transform': { 'function': { 'auxiliary': 'imperfective_aspect' } },
		'comment': 'skip all because it may be a question (eg. "Are those people going?"). We\'ll have to assume it\'s not an error.',
	},
	{
		'name': 'be before a stem Verb, (especially one that contains a hyphen) indicates the clause is potentially passive',
		'trigger': { 'stem': 'be' },
		'context': {
			'followedby': [
				{ 'category': 'Verb', 'form': 'stem', 'skip': 'all' },
			],
		},
		'transform': { 'function': { 'auxiliary': 'generic|passive' } },
		'comment': 'eg. "John was go-up the mountain by(close to) the river" is not a passive, but this situation is incredibly rare.',
	},
	{
		'name': 'be before a perfect Verb indicates passive',
		'trigger': { 'stem': 'be' },
		'context': {
			'followedby': {
				'category': 'Verb',
				'form': 'perfect',
				'skip': 'all',
			},
		},
		'transform': { 'function': { 'auxiliary': 'passive' } },
		'comment': 'skip all because it may be a question (eg. "Are those words written in the book?"). We\'ll have to assume it\'s not an error.',
	},
	{
		'name': 'Any \'be\' verb remaining before another verb becomes a generic auxiliary',
		'trigger': { 'category': 'Verb', 'stem': 'be' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'all' },
		},
		'transform': { 'function': { 'auxiliary': 'generic' } },
		'comment': 'the more precise function may be ambiguous e.g. "was cry-out".',
	},
	{
		'name': 'be before any Verb and followed by _implicitActiveAgent always indicates the passive',
		'trigger': { 'stem': 'be', 'tag': { 'auxiliary': 'generic' } },
		'context': {
			'followedby': [
				{ 'category': 'Verb', 'skip': 'all' },
				{ 'token': '_implicitActiveAgent', 'skip': 'all' },
			],
		},
		'transform': { 'tag': { 'auxiliary': 'passive' } },
	},
	{
		'name': 'by preceded by a passive be indicates the agent',
		'trigger': { 'token': 'by' },
		'context': {
			'precededby': { 'tag': { 'auxiliary': 'passive' }, 'skip': 'all' },
		},
		'transform': { 'function': { 'pre_np_adposition': 'agent_of_passive' } },
		'comment': "Only in extremely rare cases like 'John was sit-down by the tree' will it not actually be passive.",
	},
	{
		'name': "'same_participant' subordinate clauses become 'different_participant/same_subject_passive' if the verb is passive",
		'trigger': { 'tag': { 'clause_type': 'patient_clause_same_participant' } },
		'context': { 
			'subtokens': [
				{ 'tag': { 'auxiliary': 'passive' }, 'skip': 'all' },
				{ 'tag': { 'pre_np_adposition': 'agent_of_passive' }, 'skip': 'all' },
			],
		},
		'transform': { 'tag': { 'clause_type': 'patient_clause_different_participant|patient_clause_same_subject_passive' } },
		'comment': 'eg John was ready-C [to be killed by people].',
	},
	// Adpositions
	{
		'name': "'that' preceded by the Adposition 'so' does not have any function",
		'trigger': { 'token': 'that' },
		'context': {
			'precededby': { 'stem': 'so', 'category': 'Adposition' },
		},
		'transform': { 'remove_tag': ['syntax', 'determiner'] },
		'comment': 'both "so that" and "so-that" are supported and map to the Adposition "so"',
	},
	{
		'name': "'from' becomes a function word when not followed by a time word",
		'trigger': { 'token': 'from' },
		'context': {
			'notfollowedby': { 'stem': 'time|day|evening|morning|beginning', 'skip': 'np_modifiers' },
		},
		'transform': { 'function': { } },
		'comment': '"from" followed by a time word does not indicate a source argument, but remains an Adposition',
	},
	// Noun Phrase handling
	{
		'name': 'tag head nouns',
		'trigger': { 'category': 'Noun' },
		'context': {
			'notprecededby': [{ 'category': 'Noun' }, { 'token': 'of', 'skip': 'np_modifiers' }],
		},
		'transform': { 'tag': { 'syntax': 'head_np', 'role': 'none' } },
		'comment': "can't use 'np_modifiers' in the 'notfollowedby' skip since we don't want to skip the genitive_norman 'of'",
	},
	{
		'name': 'remove head_np tag from saxon genitives, made_of, and title relations',
		'trigger': { 'tag': { 'relation': 'genitive_saxon|made_of|title' } },
		'context': { },
		'transform': { 'remove_tag': ['syntax', 'role'] },
	},
	{
		'name': 'nouns modified by an interrogative determiner get tagged with noun_tracking of interrogative',
		'trigger': { 'tag': { 'syntax': 'head_np' } },
		'context': {
			'precededby': { 'tag': { 'determiner': 'interrogative' }, 'skip': 'np_modifiers' },
		},
		'transform': { 'tag': { 'noun_tracking': 'interrogative' } },
		'comment': '',
	},
	{
		'name': 'handle noun argument for relationship with X',
		'trigger': { 'stem': 'relationship' },
		'context': {
			'followedby': [
				{ 'token': 'with' },
				{ 'category': 'Noun', 'skip': 'np_modifiers' },
			],
		},
		'context_transform': [
			{ 'function': { 'pre_np_adposition': 'noun_argument' } },
			{ 'tag': { 'syntax': 'nested_np', 'role': 'noun_argument_np' } },
		],
		'comment': "eg 'relationship with X'. X should not be interpreted as an argument of a Verb",
	},
	{
		'name': 'handle noun argument for faith in X',
		'trigger': { 'stem': 'faith' },
		'context': {
			'followedby': [
				{ 'token': 'in' },
				{ 'category': 'Noun', 'skip': 'np_modifiers' },
			],
		},
		'context_transform': [
			{ 'function': { 'pre_np_adposition': 'noun_argument' } },
			{ 'tag': { 'syntax': 'nested_np', 'role': 'noun_argument_np' } },
		],
		'comment': "eg 'faith in X'. X should not be interpreted as an argument of a Verb",
	},
	{
		'name': 'handle comparative noun arguments',
		'trigger': { 'tag': { 'pre_np_adposition': 'comparative_than|comparative_as' } },
		'context': {
			'followedby': { 'category': 'Noun', 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' },
		},
		'context_transform': { 'tag': { 'syntax': 'nested_np|comparative_np' } },
		'comment': "eg 'bigger than X', 'more content than X', 'more food than X', etc ",
	},
	// Commas and Coordination
	{
		'name': 'tag all commas',
		'trigger': { 'token': ',' },
		'transform': { 'tag': { 'syntax': 'comma' } },
	},
	{
		'name': 'tag addressee nouns and commas',
		'trigger': { 'tag': { 'syntax': 'head_np' } },
		'context': {
			'followedby': [
				{ 'token': ',', 'skip': [{ 'category': 'Conjunction' }, 'np'] },
				{ 'tag': { 'syntax': 'head_np' }, 'skip': 'all' },	// the agent
				{ 'category': 'Verb', 'skip': 'all' },
			],
		},
		'transform': { 'tag': { 'role': 'addressee' } },
		'context_transform': [{ 'tag': { 'syntax': 'comma_addressee' } }],
	},
	{
		'name': 'by default, tag all "and/or" as "noun" coordination',
		'trigger': { 'stem': 'and|or' },
		'transform': { 'tag': { 'syntax': 'coord_noun' } },
	},
	{
		'name': 'tag "and/or" with adjectives',
		'trigger': { 'stem': 'and|or' },
		'context': { 'precededby': { 'category': 'Adjective', 'skip': { 'token': ',' } } },
		'transform': { 'tag': { 'syntax': 'coord_adj' } },
	},
	{
		'name': 'tag "and" with adverbs',
		'trigger': { 'stem': 'and' },
		'context': { 'precededby': { 'category': 'Adverb', 'skip': { 'token': ',' } } },
		'transform': { 'tag': { 'syntax': 'coord_adv' } },
	},
	{
		'name': 'tag "and/or/but" at start of subordinate clauses',
		'trigger': { 'stem': 'and|or|but' },
		'context': { 'precededby': { 'token': '[' } },
		'transform': { 'tag': { 'syntax': 'coord_clause' } },
	},
	{
		'name': 'tag "and/or/but" at start of sentences',
		'trigger': { 'stem': 'and|or|but', 'tag': { 'position': 'first_word' } },
		'transform': { 'tag': { 'syntax': 'coord_clause' } },
	},
	// Noun List Indexing
	{
		'name': 'Set tag for nouns indexed with _1',
		'trigger': { 'category': 'Noun' },
		'context': { 'followedby': { 'token': '_1' } },
		'transform': { 'tag': { 'noun_index': '1' } },
	},
	{
		'name': 'Set tag for nouns indexed with _2',
		'trigger': { 'category': 'Noun' },
		'context': { 'followedby': { 'token': '_2' } },
		'transform': { 'tag': { 'noun_index': '2' } },
	},
	{
		'name': 'Set tag for nouns indexed with _3',
		'trigger': { 'category': 'Noun' },
		'context': { 'followedby': { 'token': '_3' } },
		'transform': { 'tag': { 'noun_index': '3' } },
	},
	{
		'name': 'Set tag for nouns indexed with _4',
		'trigger': { 'category': 'Noun' },
		'context': { 'followedby': { 'token': '_4' } },
		'transform': { 'tag': { 'noun_index': '4' } },
	},
	{
		'name': 'Set tag for nouns indexed with _5',
		'trigger': { 'category': 'Noun' },
		'context': { 'followedby': { 'token': '_5' } },
		'transform': { 'tag': { 'noun_index': '5' } },
	},
]

export function parse_transform_rule({ rule_json, index }: {
	rule_json: TransformRuleJson
	index: number
}): TokenRule {
	const trigger = create_token_filter(rule_json['trigger'])
	const context = create_context_filter(rule_json['context'])
	const transform = 'transform' in rule_json ? create_token_transform(rule_json['transform']) : null
	const context_transforms = create_token_transforms(rule_json['context_transform'])
	const subtoken_transforms = create_token_transforms(rule_json['subtoken_transform'])

	return {
		id: `transform:${index}`,
		name: rule_json['name'] ?? '',
		trigger,
		context,
		action: transform_rule_action,
	}

	function transform_rule_action({ tokens, trigger_index, context_indexes, subtoken_indexes, rule_id }: RuleTriggerContext): number {
		if (transform) {
			tokens[trigger_index] = transform(tokens[trigger_index])
			tokens[trigger_index].applied_rules.push(`transform - ${rule_id}`)
		}
		apply_token_transforms({ tokens, token_indexes: context_indexes, transforms: context_transforms, rule_info: `transform:context - ${rule_id}` })
		apply_token_transforms({ tokens: tokens[trigger_index].sub_tokens, token_indexes: subtoken_indexes, transforms: subtoken_transforms, rule_info: `transform:subtoken - ${rule_id}` })

		return trigger_index + 1
	}

	function apply_token_transforms({ tokens, token_indexes, transforms, rule_info }: { tokens: Token[]; token_indexes: number[]; transforms: TokenTransform[]; rule_info: string }) {
		for (let i = 0; i < token_indexes.length && i < transforms.length; i++) {
			const transformed_token = transforms[i](tokens[token_indexes[i]])
			transformed_token.applied_rules.push(rule_info)
			tokens[token_indexes[i]] = transformed_token
		}
	}
}

const builtin_transform_rules: BuiltInRule[] = [
	{
		name: "All clauses within a relative clause are tagged as 'in_relative_clause'",
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'relative_clause' } }),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token, rule_id }) => {
				tag_nested_clauses({ clause_token: trigger_token, tag_to_set: { 'in_relative_clause': 'true' }, rule_id })
			}),
		},
	},
	{
		name: "All clauses within a question are tagged as 'in_interrogative'",
		comment: '',
		rule: {
			trigger: create_token_filter({ 'type': TOKEN_TYPE.CLAUSE, 'tag': 'interrogative' }),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token, rule_id }) => {
				tag_nested_clauses({ clause_token: trigger_token, tag_to_set: { 'in_interrogative': 'true' }, rule_id })
			}),
		},
	},
	{
		name: 'Find and mark metric-biblical units pairing tokens',
		comment: 'these pairings use the same separator as simple-complex, and can only be determined once the ontology data is present',
		rule: {
			trigger: token => token.pairing_type === 'simple-complex',
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token }) => {
				const result = trigger_token.pairing?.lookup_results[0]
				if (!result) {
					return
				}

				if (result.gloss.startsWith('(biblical unit)') || IS_CARDINAL_NUMBER.test(result.stem)) {
					trigger_token.pairing_type = 'metric-biblical'
				}
			}),
		},
	},
]

function tag_nested_clauses({ clause_token, tag_to_set, rule_id }: { clause_token: Token; tag_to_set: Tag, rule_id: string }) {
	const quote_begin_filter = create_token_filter({ 'tag': { 'clause_type': 'patient_clause_quote_begin' } })

	function tag_clause_tokens(clause_tokens: Token[]) {
		// the first token is always the opening bracket. this is what we want to tag
		add_tag_to_token({ token: clause_tokens[0], tag: tag_to_set, rule_id })

		for (let i = 0; i < clause_tokens.length; i++) {
			const token = clause_tokens[i]
			if (token.sub_tokens.length > 0 && !quote_begin_filter(token)) {
				tag_clause_tokens(token.sub_tokens)
			}
		}
	}

	tag_clause_tokens(clause_token.sub_tokens)
}

export const TRANSFORM_RULES = transform_rules_json.map((rule_json, index) => parse_transform_rule({ rule_json, index }))
	.concat(builtin_transform_rules.map(from_built_in_rule('transform')))
