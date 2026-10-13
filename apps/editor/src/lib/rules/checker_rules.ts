import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
import { ERRORS } from '#lib/parser/error_messages.js'
import { MESSAGE_TYPE, TOKEN_TYPE, create_added_token, format_token_message, is_one_part_of_speech, set_message_plain, token_has_tag } from '#lib/token.js'
import { REGEXES } from '#lib/regexes.js'
import { spaced_insertion_text } from '#lib/text_insertions.js'
import { validate_case_frame } from './case_frame'
import { create_context_filter, create_token_filter, from_built_in_rule, message_set_action } from './rules_parser'
import type { CheckerMessage, CheckerMessageType, CheckerTextInsertion } from '@tabitha/types'
import type { MessageInfo, Token } from '#lib/types.js'
import type {
	BuiltInRule,
	CheckerActionJson,
	CheckerRuleJson,
	LookupFilter,
	RuleAction,
	RuleTriggerContext,
	TokenFilter,
	TokenRule,
} from '#lib/rules/types.js'

const checker_rules_json: CheckerRuleJson[] = [
	{
		'name': 'Check for "it" apart from an agent clause',
		'trigger': { 'tag': { 'syntax': 'agent_proposition_subject' } },
		'context': {
			'notfollowedby': { 'tag': { 'clause_type': 'agent_clause' }, 'skip': 'all' },
		},
		'error': {
			'message': 'Third person pronouns should be replaced with the Noun they represent, e.g., Paul (instead of him).',
		},
	},
	{
		'name': 'Expect an agent of a passive',
		'trigger': { 'category': 'Verb', 'form': 'perfect' },
		'context': {
			'precededby': { 'tag': { 'auxiliary': 'passive' }, 'skip': 'all' },
			'notfollowedby': { 'tag': [{ 'role': 'agent' }, { 'pre_np_adposition': 'agent_of_passive' }], 'skip': 'all' },
		},
		'error': {
			'followedby': 'by X',
			'message': 'A passive verb must have an explicit agent. Use _implicitActiveAgent if necessary.',
		},
		'comment': 'A passive verb requires a "by X" agent.',
	},
	{
		'name': 'each other must be hyphenated',
		'trigger': { 'stem': 'each' },
		'context': {
			'followedby': { 'stem': 'other' },
			'notfollowedby': { 'category': 'Noun', 'skip': { 'category': 'Adjective' } },
		},
		'error': {
			'message': 'Reciprocal each-other must be hyphenated.',
		},
	},
	{
		'name': "Suggest expanding 'there' to 'at that place' for clarity",
		'trigger': { 'token': 'There|there' },
		'context': { 'notfollowedby': { 'stem': 'be', 'skip': 'vp_modifiers' } },	// TODO trigger on 'not tag existential' instead
		'suggest': {
			'message': "Consider using 'at that place' instead of 'there', especially if a preposition other than 'at' is wanted.",
		},
	},
	{
		'name': "Suggest expanding 'here' to 'at this place' for clarity",
		'trigger': { 'token': 'Here|here' },
		'suggest': {
			'message': "Consider using 'at this place' instead of 'here', especially if a preposition other than 'at' is wanted.",
		},
	},
	{
		'name': 'Flag two verbs within the same sentence',
		'trigger': { 'category': 'Verb' },
		'context': {
			'precededby': { 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': 'Cannot have multiple verbs in the same clause ({0:stem} and {stem}). Check for an unbracketed subordinate clause or consider splitting the sentence.',
		},
		'comment': 'See section 0.3 of the Phase 1 checklist',
	},
	{
		'name': 'Check for an Imperative Verb with no subject at the beginning of a sentence',
		'trigger': { 'category': 'Verb', 'form': 'stem', 'tag': { 'position': 'first_word' } },
		'error': {
			'precededby': 'You(X) (imp)',
			'message': 'An imperative clause must have an explicit subject.',
		},
	},
	{
		'name': 'Check for an Imperative Verb with no subject after a conjunction at the beginning of a sentence',
		'trigger': { 'category': 'Verb', 'form': 'stem' },
		'context': {
			'precededby': { 'category': 'Conjunction', 'tag': { 'position': 'first_word' } },
		},
		'error': {
			'precededby': 'you(X) (imp)',
			'message': 'An imperative clause must have an explicit subject.',
		},
	},
	{
		'name': 'Check for an imperative note in a non-quote subordinate clause',
		'trigger': { 'token': '(imp)' },
		'context': {
			'precededby': { 'token': '[', 'skip': 'all' },
			'notprecededby': { 'token': '"', 'skip': 'all' },
		},
		'error': {
			'message': 'Cannot mark complement clauses as imperative.',
		},
	},
	{
		'name': 'Check for "Let\'s"',
		'trigger': { 'token': 'Let\'s|let\'s' },
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'vp_modifiers' },
		},
		'error': {
			'message': 'Write \'We(X) {0:stem} _suggestiveLets\' instead. See P1 Checklist section 15.',
		},
	},
	{
		'name': "Check for 'Let X...'",
		'trigger': { 'token': 'Let' },
		'context': {
			'followedby': [{ 'category': 'Noun' }, { 'category': 'Verb', 'form': 'stem', 'skip': 'vp_modifiers' }],
		},
		'error': {
			'message': "For the jussive write '{0:token} {1:stem} (jussive) ...' instead of 'Let {0:token} {1:stem}...'. Or use '(imp)' for expressing permission. See P1 Checklist section 15.",
		},
	},
	{
		'name': 'Check for \'May X...\'',
		'trigger': { 'token': 'May' },
		'context': {
			'followedby': { 'category': 'Noun' },
		},
		'error': {
			'message': 'Write \'I(X) pray-hope [{0:token}...]\' instead. See P1 Checklist section 15.',
		},
	},
	{
		'name': 'Avoid using \'way\'',
		'trigger': { 'stem': 'way' },
		'suggest': {
			'message': 'Consider rewording to avoid the use of \'way\'. If that is impossible, you can still use it in the sense of means or method.',
		},
		'comment': 'See section X of the Phase 1 checklist',
	},
	{
		'name': 'Cannot use \'even\'',
		'trigger': { 'stem': 'even' },
		'error': {
			'message': 'Cannot use \'even\'. Simply omit it or reword the sentence to get the right emphasis. See P1 Checklist section 17.',
		},
		'comment': 'See section 17 of the Phase 1 checklist',
	},
	{
		'name': "Cannot use 'any'",
		'trigger': { 'stem': 'any' },
		'error': {
			'message': "Cannot use 'any'. Simply use 'a' instead. See P1 Checklist section 17.",
		},
		'comment': 'See section 17 of the Phase 1 checklist',
	},
	{
		'name': "Cannot use 'really'",
		'trigger': { 'token': 'really' },
		'error': {
			'message': "Cannot use 'really'. Use 'actually', 'truly', 'very', or 'much' instead.",
		},
		'comment': 'See section 1 of the Phase 1 checklist',
	},
	{
		'name': 'Cannot say "X\'s own Y"',
		'trigger': { 'token': 'own' },
		'context': {
			'precededby': { 'tag': { 'relation': 'genitive_saxon' }, 'skip': { 'token': 'very' } },
			'followedby': { 'category': 'Noun', 'skip': 'np_modifiers' },
		},
		'error': {
			'message': 'Cannot write "{0:token} own {1:token}". Simply omit \'own\' or write "{0:token} _emphasized {1:token}" if desired. See P1 Checklist section 17.',
		},
		'comment': 'See section 17 of the Phase 1 checklist',
	},
	// TODO redo with the new time-long-hours etc concepts in the Ontology
	// {
	// 	'name': 'Avoid vague units of time',
	// 	'trigger': { 'stem': 'short|long|some' },
	// 	'context': {
	// 		'precededby': { 'token': 'For|for', 'skip': { 'token': 'a' } },
	// 		'followedby': { 'stem': 'time' },
	// 	},
	// 	'suggest': {
	// 		'message': "Try using more specific units of time (eg. 'for many years') or express it in a different way (eg. 'for much time').",
	// 	},
	// },
	{
		'name': 'Suggest a comma after temporal phrase "One day/morning/evening..."',
		'trigger': { 'token': 'day|morning|afternoon|evening|night|week|month|year' },
		'context': {
			'precededby': { 'token': 'One' },
			'followedby': [{ 'token': 'that' }, { 'category': 'Noun' }],
		},
		'suggest': {
			'followedby': ',',
			'auto_fix': true,
			'message': "Add a comma after 'One {token}' so the 'that' doesn't confuse the Analyzer.",
		},
		'comment': 'The Analyzer messes up "One day that man...", but it works fine with a comma.',
	},
	{
		'name': 'Expect a [ before a relative clause',
		'trigger': { 'tag': { 'syntax': 'relativizer' } },
		'context': {
			'precededby': { 'category': 'Noun' },
		},
		'error': {
			'precededby': '[',
			'message': 'Missing bracket before relative or complement clause.',
		},
	},
	{
		'name': 'Expect a [ before a quote',
		'trigger': { 'token': ',' },
		'context': {
			'followedby': { 'token': '"' },
		},
		'error': {
			'followedby': '[',
			'message': 'Missing bracket before an opening quote',
		},
	},
	{
		'name': 'Expect a , before a quote_begin clause',
		'trigger': { 'tag': { 'clause_type': 'patient_clause_quote_begin' } },
		'context': {
			'notprecededby': { 'token': ',' },
		},
		'error': {
			'precededby': ',',
			'message': 'Missing comma before an opening quote',
		},
	},
	{
		'name': "'so' in an Adverbial clause should be followed by 'that'",
		'trigger': { 'token': 'so', 'category': 'Adposition' },
		'context': {
			'notfollowedby': { 'token': 'that' },
		},
		'suggest': {
			'message': "Use 'so-that' so-that it doesn't get mistaken for the Conjunction.",
		},
	},
	{
		'name': "Check for unhyphenated Verbs with 'around'",
		'trigger': { 'token': 'around' },
		'context': {
			'precededby': { 'stem': 'turn', 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': "'around' must be hyphenated with the Verb (i.e. {0:stem}-around). DO NOT inflect the Verb (e.g. NOT turned-around).",
		},
	},
	{
		'name': "Check for unhyphenated Verbs with 'away'",
		'trigger': { 'token': 'away' },
		'context': {
			'precededby': { 'stem': 'chase|take|walk', 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': "'away' must be hyphenated with the Verb (i.e. {0:stem}-away). DO NOT inflect the Verb (e.g. NOT took-away).",
		},
	},
	{
		'name': "Check for unhyphenated Verbs with 'down'",
		'trigger': { 'token': 'down' },
		'context': {
			'precededby': { 'stem': 'cut|knock|lie|run|sit|walk|write', 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': "'down' must be hyphenated with the Verb (i.e. {0:stem}-down). DO NOT inflect the Verb (e.g. NOT ran-down).",
		},
	},
	{
		'name': "Check for unhyphenated Verbs with 'off'",
		'trigger': { 'token': 'off' },
		'context': {
			'precededby': { 'stem': 'cut|pull|take', 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': "'off' must be hyphenated with the Verb (i.e. {0:stem}-off). DO NOT inflect the Verb (e.g. NOT took-off).",
		},
	},
	{
		'name': "Check for unhyphenated 'put on' (clothes)",
		'trigger': { 'stem': 'on' },
		'context': {
			'precededby': { 'stem': 'put', 'category': 'Verb' },
			'followedby': { 'stem': 'clothes|glove|sandal|shirt|shoe' },
		},
		'error': {
			'message': "'on' must be hyphenated with the Verb (i.e. put-on).",
		},
		'comment': "The clothing-related nouns must be present because we don't want this rule applying to 'put on' in general",
	},
	{
		'name': "Check for unhyphenated Verbs with 'out'",
		'trigger': { 'token': 'out' },
		'context': {
			'precededby': { 'stem': 'come|cry|pour|pull', 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': "'out' must be hyphenated with the Verb (i.e. {0:stem}-out). DO NOT inflect the Verb (e.g. NOT cried-out).",
		},
	},
	{
		'name': "Check for unhyphenated Verbs with 'up'",
		'trigger': { 'token': 'up' },
		'context': {
			'precededby': { 'stem': 'go|pick|run|sit|stand|wake|walk', 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': "'up' must be hyphenated with the Verb (i.e. {0:stem}-up). DO NOT inflect the Verb (e.g. NOT picked-up).",
		},
	},
	{
		'name': 'Some noun plurals aren\'t recognized',
		'trigger': { 'token': 'troubles|lands' },
		'error': {
			'message': "TBTA does not use the plural '{token}'. Put '_plural' after the singular form to indicate plurality.",
		},
	},
	{
		'name': "Don't allow 'what' as a relativizer",
		'trigger': { 'token': 'what' },
		'context': {
			'precededby': { 'token': '[' },
			'notfollowedby': { 'token': '?', 'skip': 'all' },
		},
		'error': {
			'message': "Cannot use 'what' as a relativizer. Use 'the thing [that...]' instead.",
		},
		'comment': 'See section 0.41 of the Phase 1 checklist',
	},
	{
		'name': "Warn about using 'what' instead of 'which thing'",
		'trigger': { 'token': 'What|what' },
		'warning': {
			'message': "'what' always becomes 'which thing-A'. Consider writing 'which X' if you want something different.",
		},
		'comment': 'See section 0.41 of the Phase 1 checklist',
	},
	{
		'name': "Don't allow 'where' as a relativizer",
		'trigger': { 'token': 'where' },
		'context': {
			'precededby': { 'token': '[' },
			'notfollowedby': { 'token': '?', 'skip': 'all' },
		},
		'error': {
			'message': "Cannot use 'where' as a relativizer. Use 'the place [that...]' instead.",
		},
		'comment': 'See section 0.8 of the Phase 1 checklist',
	},
	{
		'name': "Don't allow 'when' as a relativizer",
		'trigger': { 'type': TOKEN_TYPE.CLAUSE },
		'context': {
			'precededby': { 'token': 'time' },
			'subtokens': { 'token': 'when', 'skip': 'clause_start' },
		},
		'error': {
			'on': 'subtokens:0',
			'message': "Cannot use 'when' as a relativizer. Use 'the time [that...]' instead. See P1 Checklist 0.8.",
		},
		'comment': 'See section 0.8 of the Phase 1 checklist.',
	},
	{
		'name': "Don't allow 'whose' as a relativizer",
		'trigger': { 'token': 'whose' },
		'error': {
			'message': "Cannot use 'whose'. Use 'X [who had...]' instead. See P1 Checklist section 6.",
		},
		'comment': 'See section 6 of the Phase 1 checklist',
	},
	{
		'name': "Use 'all of' rather than 'all' for non-generic Nouns",
		'trigger': { 'stem': 'all' },
		'context': {
			'followedby': { 'tag': 'determiner' },
		},
		'error': {
			'followedby': 'of',
			'auto_fix': true,
			'message': "Use 'all of', unless the modified Noun is generic. See P1 Checklist 0.17.",
		},
		'comment': 'Catches "all the|these|those people" but allows "all people"',
	},
	{
		'name': 'Cannot use aspect auxilliaries (eg start) without another Verb',
		'trigger': { 'stem': 'start|stop|continue|finish' },
		'context': {
			'notfollowedby': { 'category': 'Verb', 'skip': 'all' },
		},
		'error': {
			'message': "Must use '{stem}' with another Verb. See P1 Checklist 0.19.",
		},
		'comment': 'See section 0.19 of the Phase 1 checklist.',
	},
	{
		'name': "Must use 'X is able to' instead of 'X can'",
		'trigger': { 'token': 'can' },
		'error': {
			'message': "Use 'be able [to...]' instead of 'can'. See P1 Checklist 2.1.",
		},
		'comment': 'See section 2.1 of the Phase 1 checklist.',
	},
	{
		'name': "Cannot use 'could' unless in a 'so' adverbial clause",
		'trigger': { 'token': 'could' },
		'context': {
			'notprecededby': [{ 'token': '[', 'skip': { 'category': 'Conjunction' } }, { 'stem': 'so', 'skip': 'all' }],
		},
		'error': {
			'message': "Use 'be able [to...]' instead of 'could', unless in a 'so-that' clause. See P1 Checklist 2.1.",
		},
		'comment': 'See section 2.1 of the Phase 1 checklist.',
	},
	{
		'name': "Cannot use 'is going to' as a future marker",
		'trigger': { 'token': 'going' },
		'context': {
			'followedby': [{ 'token': 'to' }, { 'category': 'Verb' }],
		},
		'error': {
			'message': "Use 'will {1:stem}' instead of 'going to {1:token}' to express future tense. See P1 Checklist 0.28.",
		},
		'comment': 'See section 0.28 of the Phase 1 checklist.',
	},
	{
		'name': "Cannot use 'is to {Verb}' as an obligation, unless in an 'if' clause",
		'trigger': { 'token': 'be|is|am|are|were' },
		'context': {
			'followedby': [{ 'token': 'to' }, { 'category': 'Verb' }],
			'notprecededby': { 'stem': 'if', 'skip': 'all' },
		},
		'error': {
			'message': "Use 'will', 'must', or 'should' instead of '{token} to...' to express a future obligation.",
		},
		'comment': "The 'be' verb is already a function token, and so we can't use 'stem'",
	},
	{
		'name': "Cannot use 'have to {Verb}' as an obligation",
		'trigger': { 'token': 'have|had|has' },
		'context': {
			'followedby': [{ 'token': 'to' }, { 'category': 'Verb' }],
		},
		'error': {
			'message': "Use 'must' or 'should' instead of '{token} to...' to express an obligation.",
		},
		'comment': "The 'have' verb is already a function token, and so we can't use 'stem'",
	},
	{
		'name': 'Cannot have two conjunctions to begin a sentence',
		'trigger': { 'category': 'Conjunction' },
		'context': {
			'precededby': { 'category': 'Conjunction' },
		},
		'error': {
			'message': 'Cannot use two conjunctions. Pick the one that is most meaningful.',
		},
	},
	{
		'name': 'Cannot use \'now\' as a conjuntion to start a sentence',
		'trigger': { 'token': 'Now', 'tag': { 'position': 'first_word' } },
		'warning': {
			'message': "Note TBTA does not have the discourse marker 'now', only the adverb 'now' meaning 'at the present time'.",
		},
	},
	{
		'name': 'Suggest using an attributive Adjective instead of a predicative relative clause',
		'trigger': { 'tag': { 'adj_usage': 'predicative' } },
		'context': {
			'precededby': [
				{ 'tag': { 'syntax': 'relativizer' }, 'skip': 'all' },
				{ 'stem': 'be', 'skip': 'all' },
			],
		},
		'suggest': {
			'message': "Consider writing '{stem} X' instead of 'X [{0:token} be {stem}]'. The attributive adjective is generally preferred over a relative clause.",
		},
	},
	{
		'name': "Check for an errant 'that' in a complement clause",
		'trigger': { 'tag': { 'clause_type': 'patient_clause_different_participant|agent_clause' } },
		'context': {
			'subtokens': { 'token': 'that', 'skip': 'clause_start' },
		},
		'suggest': {
			'on': 'subtokens:0',
			'message': "Unless this 'that' is supposed to be a demonstrative, consider removing it. Avoid using 'that' as a complementizer in general.",
		},
		'comment': 'While TBTA sometimes accepts it, using "that" as a complementizer is too inconsistent and so is not allowed in P1',
	},
	{
		'name': "Don't allow passives in 'in-order-to' adverbial clauses",
		'trigger': { 'tag': { 'auxiliary': 'passive' } },
		'context': {
			'precededby': { 'stem': 'in-order-to', 'skip': 'all' },
		},
		'error': {
			'message': "Cannot use a passive within an 'in-order-to' clause because its subject is required to be the same as the outer Verb. Consider using 'so-that' instead. See P1 Checklist 24.",
		},
		'comment': 'eg. John went to the market XX[in-order-to be seen by Mary]XX.',
	},
	{
		'name': 'Don\'t allow passives in \'by\' adverbial clauses',
		'trigger': { 'tag': { 'auxiliary': 'passive' } },
		'context': {
			'precededby': { 'stem': 'by', 'skip': 'all' },
		},
		'error': {
			'message': "Cannot use a passive within a 'by' clause because its subject is required to be the same as the outer Verb. Consider using 'because' instead. See P1 Checklist 24.",
		},
		'comment': 'eg. John went to the market XX[by being taken by Mary]XX.',
	},
	{
		'name': "Don't allow negatives with 'purpose' adverbial clauses",
		'trigger': { 'tag': { 'clause_type': 'adverbial_clause' } },
		'context': {
			'precededby': { 'tag': { 'verb_polarity': 'negative' }, 'skip': 'all' },
			'subtokens': { 'stem': 'in-order-to|because|so', 'skip': 'clause_start' },
		},
		'warning': {
			'on': 'context:0',
			'message': "Avoid using a negative verb outside a clause expressing cause or purpose, as the scope of the 'not' is ambiguous. See P1 Checklist 27 for suggestions.",
		},
		'comment': "See Phase 1 Checklist section 27. eg 'John did not go [in-order-to buy food].' - does this mean he didn't go at all or he went for a different reason?",
	},
	{
		'name': "Check for if 'of' is in the wrong place before a _literalExpansion/_dynamicExpansion token",
		'trigger': { 'token': '_literalExpansion|_dynamicExpansion' },
		'context': {
			'precededby': { 'token': 'of' },
		},
		'error': {
			'on': 'context:0',
			'message': "For literal/dynamic expansions, write 'X of Y {token}' instead of 'X Y of {token}'.",
		},
	},
	{
		'name': 'Check for negation on Adjectives',
		'trigger': { 'tag': { 'verb_polarity': 'negative' } },
		'context': {
			'followedby': { 'category': 'Adjective', 'skip': 'adjp_modifiers_attributive' },
			'notprecededby': { 'stem': 'be', 'skip': 'all' },
		},
		'error': {
			'message': 'Adjectives cannot be negated. Negate the Verb instead or find another way to word it.',
		},
		'comment': 'eg. "Not all of the people of Israel are true people of God." But something like "John is not happy" is still valid.',
	},
	{
		'name': 'Check for nested independent clauses with "and" or "but", when not preceded by a clause',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE },
		'context': {
			'subtokens': [{ 'token': '[' }, { 'token': 'and|but' }],
			'notprecededby': { 'type': TOKEN_TYPE.CLAUSE },
		},
		'error': {
			'on': 'subtokens:0',
			'message': 'Cannot have a nested independent clause. Instead, split the sentence into two.',
		},
	},
	{
		'name': 'Check for nested independent clauses with "and" or "but", when preceded by a relative clause',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'patient_clause_different_participant' } },
		'context': {
			'subtokens': [{ 'token': '[' }, { 'token': 'and|but' }],
			'precededby': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'relative_clause' } },
		},
		'error': {
			'on': 'subtokens:0',
			'message': 'Cannot have a nested independent clause. Instead, split the sentence into two.',
		},
	},
]

const builtin_checker_rules: BuiltInRule[] = [
	{
		name: 'Check capitalization for first word in a sentence or quote',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'position': 'first_word' } }),
			context: create_context_filter({}),
			action: message_set_action(({ trigger_token: token }) => {
				const token_to_test = token.pronoun ? token.pronoun : token
				if (REGEXES.STARTS_LOWERCASE.test(token_to_test.token)) {
					return { token_to_flag: token_to_test, error: ERRORS.FIRST_WORD_NOT_CAPITALIZED }
				}
			}),
		},
	},
	{
		name: 'Check Verb argument structure/case frame',
		comment: "Don't validate Verbs that are in the same clause as another Verb, since there is already an error that will show for that",
		rule: {
			trigger: create_token_filter({ 'category': 'Verb' }),
			context: create_context_filter({
				'notprecededby': { 'category': 'Verb', 'skip': 'all' },
			}),
			action: message_set_action(validate_case_frame),
		},
	},
	{
		name: 'Check argument structure/case frame',
		comment: 'case frame rules can eventually be used for verbs, adjectives, adverbs, adpositions, and even conjunctions',
		rule: {
			trigger: create_token_filter({ 'category': 'Adjective|Adposition' }),
			context: create_context_filter({ }),
			action: message_set_action(validate_case_frame),
		},
	},
	{
		name: 'Check if a Verb has no theta grid information',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'category': 'Verb' }),
			context: create_context_filter({ }),
			action: message_set_action(function* ({ trigger_token }) {
				yield check_for_empty_theta_grid(trigger_token)
				if (trigger_token.pairing) {
					yield check_for_empty_theta_grid(trigger_token.pairing)
				}

				function check_for_empty_theta_grid(token: Token): MessageInfo {
					if (token.lookup_results.length === 0) {
						return {}
					}
					if (token.lookup_results.every(lookup => lookup.categorization.length === 0)) {
						return { token_to_flag: token, warning: "'{stem}' has no theta grid information to check with. Double check the expected arguments with a colleague." }
					} else if (token.lookup_results[0].categorization.length === 0) {
						return { token_to_flag: token, warning: "'{sense}' has no theta grid information to check with. Double check the expected arguments with a colleague." }
					}
					return {}
				}
			}),
		},
	},
	{
		name: 'Check that level 2/3 words are within a (complex) alternate',
		comment: 'The complex word may be in a nested clause within the clause that has the (complex) tag',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'main_clause' } }),
			context: create_context_filter({ }),
			action: message_set_action(({ trigger_token }) => {
				const complex_alternate_filter = create_token_filter({ 'token': '(complex)' })
				const complex_word_filter = create_token_filter({ 'level': '2|3' })

				// the stack makes it easy to track state as we go up and down clause nesting levels
				let is_complex_alternate_stack = [false]

				const messages: MessageInfo[] = []

				function search_clause_tokens(clause_tokens: Token[]) {
					for (let i = 0; i < clause_tokens.length; i++) {
						const token = clause_tokens[i]
						if (complex_alternate_filter(token)) {
							is_complex_alternate_stack = is_complex_alternate_stack.with(-1, true)

						} else if (token.sub_tokens.length) {
							is_complex_alternate_stack.push(is_complex_alternate_stack.at(-1) ?? false)
							search_clause_tokens(token.sub_tokens)
							is_complex_alternate_stack.pop()

						} else if (!is_complex_alternate_stack.at(-1)) {
							if (complex_word_filter(token)) {
								messages.push({ token_to_flag: token, error: ERRORS.WORD_LEVEL_TOO_HIGH })
							}
							// A literal pairing has the same restrictions as a normal word
							if (token.pairing && token.pairing_type === 'dynamic-literal' && complex_word_filter(token.pairing)) {
								messages.push({ token_to_flag: token.pairing, error: ERRORS.WORD_LEVEL_TOO_HIGH })
							}
						}
					}
				}

				search_clause_tokens(trigger_token.sub_tokens)

				return messages
			}),
		},
	},
	{
		name: 'Check word complexity level of complex pairings',
		comment: '',
		rule: {
			trigger: token => token.pairing_type === 'simple-complex',
			context: create_context_filter({}),
			action: message_set_action(function* ({ trigger_token: token }) {
				// a complex pairing word should always be level 2 or 3
				if (token.pairing && !check_token_level(LOOKUP_FILTERS.IS_LEVEL_COMPLEX)(token.pairing)) {
					yield { token_to_flag: token.pairing, error: ERRORS.WORD_LEVEL_TOO_LOW }
				}
			}),
		},
	},
	{
		name: 'Warn user if the word\'s complexity is ambiguous',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD,
			context: create_context_filter({}),
			action: message_set_action(function* ({ trigger_token: token }) {
				// Alert if the first result is complex and there are also non-complex results (including proper nouns - see 'ark')
				// If the first result is already simple, that will be selected by default and thus not ambiguous.
				// Level 2 and 3 words are treated differently, so a combination of the two should also be ambiguous - see 'kingdom'
				if (check_ambiguous_level(LOOKUP_FILTERS.IS_LEVEL(2))(token) || check_ambiguous_level(LOOKUP_FILTERS.IS_LEVEL(3))(token)) {
					yield { warning: ERRORS.AMBIGUOUS_LEVEL }
				}
				// A literal pairing has the same restrictions as normal words
				if (token.pairing && token.pairing_type === 'dynamic-literal'
						&& (check_ambiguous_level(LOOKUP_FILTERS.IS_LEVEL(2))(token.pairing) || check_ambiguous_level(LOOKUP_FILTERS.IS_LEVEL(3))(token.pairing))) {
					yield { token_to_flag: token.pairing, warning: ERRORS.AMBIGUOUS_LEVEL }
				}

				// Alert if the first result is simple and there are also complex results (see 'son')
				// If the first result is already complex, that will be selected by default and thus not ambiguous
				if (token.pairing && token.pairing_type === 'simple-complex' && check_ambiguous_level(LOOKUP_FILTERS.IS_LEVEL_SIMPLE)(token.pairing)) {
					yield { token_to_flag: token.pairing, warning: ERRORS.AMBIGUOUS_LEVEL }
				}
			}),
		},
	},
	{
		name: 'Check ontology status',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD,
			context: create_context_filter({}),
			action: message_set_action(function* ({ trigger_token: token }) {
				yield* check_ontology_status(token)

				if (token.pairing) {
					yield* check_ontology_status(token.pairing)
				}
			}),
		},
	},
	{
		name: 'Check for words with ambiguous parts of speech',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && !is_one_part_of_speech(token),
			context: create_context_filter({}),
			action: message_set_action(function* () {
				yield { warning: 'The editor cannot determine which part of speech this word is, so some errors and warnings within the same clause may not be accurate.' }
				yield { suggest: "Add '_noun', '_verb', '_adj', '_adv', '_adp', '_conj', or '_part' after '{token}' so the editor can check the syntax more accurately." }
			}),
		},
	},
	{
		name: 'Check for a relative clause that might supposed to be a complement clause',
		comment: 'While TBTA sometimes accepts it, using "that" as a complementizer is too inconsistent and so is not allowed in P1',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'relative_clause_that' } }),
			context: create_context_filter({
				'precededby': { 'category': 'Verb', 'skip': 'all' },
			}),
			action: message_set_action(({ tokens, trigger_token, context_indexes }) => {
				const verb_token = tokens[context_indexes[0]]
				const case_frames = verb_token.lookup_results.map(result => result.case_frame.result)
				if (case_frames.length === 0 || case_frames[0].status !== 'invalid') {
					return
				}
				const missing_arguments = new Set(case_frames.flatMap(case_frame => case_frame.missing_arguments))

				// Only show the message if all senses are invalid, but some are missing a patient clause
				if (['agent_clause', 'patient_clause_different_participant'].some(role => missing_arguments.has(role))) {
					const that_token = trigger_token.sub_tokens[1]
					return {
						token_to_flag: that_token,
						warning: 'This is being interpreted as a relative clause. If it\'s supposed to be a complement clause, remove the \'that\'.',
					}
				}
			}),
		},
	},
	{
		name: 'Warn when there is no clause with (simple) after a clause with (complex)',
		comment: 'a simple alternate should (usually) follow a complex alternate',
		rule: {
			trigger: create_token_filter({ 'type': TOKEN_TYPE.CLAUSE }),
			context: create_context_filter({
				'subtokens': { 'token': '(complex)', 'skip': 'all' },
			}),
			action: message_set_action(({ tokens, trigger_index, subtoken_indexes }) => {
				const next_clause_index = trigger_index + 1
				const next_clause_context_filter = create_context_filter({
					'subtokens': { 'token': '(simple)', 'skip': 'all' },
				})

				if (next_clause_index >= tokens.length || !next_clause_context_filter(tokens, next_clause_index).success) {
					const complex_token = tokens[trigger_index].sub_tokens[subtoken_indexes[0]]
					return {
						token_to_flag: complex_token,
						warning: 'A simple vocabulary alternate typically directly follows a complex alternate, but no simple alternate was found.',
					}
				}
			}),
		},
	},
	{
		name: 'Expect an agent of a passive (handles stem verbs)',
		comment: 'eg. "John was go-up the mountain by(close to) the river" is not a passive, but this situation is incredibly rare.',
		rule: {
			trigger: create_token_filter({ 'category': 'Verb', 'form': 'stem' }),
			context: create_context_filter({
				'precededby': { 'tag': { 'auxiliary': 'passive' }, 'skip': 'all' },
				'notfollowedby': { 'token': 'by|by X', 'skip': 'all' },
			}),
			action: message_set_action(({ trigger_token }) => {
				const top_result = trigger_token.lookup_results[0]
				if (top_result.form.includes('perfect')) {
					// don't show a warning for a word like 'cut', since we already know it's a passive, and is handled in another rule
					return
				}

				if (top_result.case_frame.usage.possible_roles.includes('patient')) {
					// A verb like 'was sit-down' looks at first like it could be passive, but can never take a patient
					return { warning: 'If this verb is passive, it must have an explicit agent. Use _implicitActiveAgent if necessary.' }
				}
			}),
		},
	},
	{
		name: 'Check for an Adjective used as a Noun after a determiner',
		comment: 'eg. Romans 10:9 "God raised Jesus from the dead." John 11:25 "The one who believes will live." Should be "dead people" and "the person who". "the same" is allowed (Exodus 26:24 "Both corners should be the same.").',
		rule: {
			trigger: token => token_has_tag({ token, tag_to_check: { 'adj_usage': 'predicative' } })
				&& token.lookup_results.length > 0
				&& token.lookup_results.every(result => result.part_of_speech === 'Adjective' && result.stem !== 'same'),
			context: create_context_filter({
				'precededby': { 'tag': { 'determiner': 'definite_article|near_demonstrative|remote_demonstrative' }, 'skip': 'adjp_modifiers_attributive' },
				'notfollowedby': { 'category': 'Noun', 'skip': 'adjp_attributive' },
			}),
			action: message_set_action(() => ({ error: "An Adjective cannot be used as a Noun. Add a Noun after '{token}' (eg. 'people'), or use a Noun instead." })),
		},
	},
]

export function parse_checker_rule({ rule_json, index }: {
	rule_json: CheckerRuleJson
	index: number
}): TokenRule {
	const trigger = create_token_filter(rule_json['trigger'])
	const context = create_context_filter(rule_json['context'])

	const message_type = Object.values(MESSAGE_TYPE).find(({ label }) => label in rule_json)!
	const checker_action_json = rule_json[message_type.label] ?? { 'message': 'will never be undefined' }
	const action = checker_action({ action: checker_action_json, message_type })

	return {
		id: `checker:${index}`,
		name: rule_json['name'] ?? '',
		trigger,
		context,
		action,
	}

	function checker_action({ action, message_type }: { action: CheckerActionJson; message_type: CheckerMessageType }): RuleAction {
		return trigger_context => {
			const { tokens, trigger_index, rule_id } = trigger_context

			const formatted_message = format_token_message({ trigger_context, message: action.message })
			const message: CheckerMessage = {
				...message_type,
				message: formatted_message,
				rule_id: trigger_context.rule_id,
			}

			// The action will have a precededby, followedby, or neither. Never both.
			if (action.precededby) {
				const insertion = auto_fix_insertion({ action, text: action.precededby, position: 'before', trigger_context })
				tokens.splice(trigger_index, 0, create_added_token({ token: action.precededby, message, rule_id, insertion }))
				return trigger_index + 2
			}
			if (action.followedby) {
				const insertion = auto_fix_insertion({ action, text: action.followedby, position: 'after', trigger_context })
				tokens.splice(trigger_index + 1, 0, create_added_token({ token: action.followedby, message, rule_id, insertion }))
				return trigger_index + 2
			}

			const token_to_flag = get_token_to_flag({ action, trigger_context })
			set_message_plain({ token: token_to_flag, message })
			return trigger_index + 1
		}
	}

	function auto_fix_insertion({ action, text, position, trigger_context: { trigger_token } }: { action: CheckerActionJson; text: string; position: 'before' | 'after'; trigger_context: RuleTriggerContext }): CheckerTextInsertion | undefined {
		const { source_range } = trigger_token
		if (!action.auto_fix || !source_range) return undefined

		const offset = position === 'before' ? source_range.start : source_range.end
		return { offset, text: spaced_insertion_text({ text, position }) }
	}

	function get_token_to_flag({ action, trigger_context: { tokens, trigger_token, context_indexes, subtoken_indexes } }: { action: CheckerActionJson; trigger_context: RuleTriggerContext }): Token {
		if (!action.on) {
			return trigger_token
		}
		const [name, index] = action.on.split(':')
		return name === 'context' ? tokens[context_indexes[parseInt(index)]] :
			name === 'subtokens' ? trigger_token.sub_tokens[subtoken_indexes[parseInt(index)]] :
				trigger_token
	}
}

export const CHECKER_RULES = builtin_checker_rules.map(from_built_in_rule('checker')).concat(checker_rules_json.map((rule_json, index) => parse_checker_rule({ rule_json, index })))

function check_token_level(level_check: LookupFilter): TokenFilter {
	return token => {
		return token.lookup_results.length > 0
			&& (token.specified_sense ? level_check(token.lookup_results[0])
				: token.lookup_results.every(result => level_check(result)))
	}
}

function check_ambiguous_level(level_check: LookupFilter): TokenFilter {
	return token => {
		return token.specified_sense.length === 0
			&& token.lookup_results.length > 0
			&& level_check(token.lookup_results[0])
			&& token.lookup_results.some(result => !level_check(result))
	}
}

function* check_ontology_status(token: Token): Generator<MessageInfo, void, unknown> {
	if (token.lookup_results.some(LOOKUP_FILTERS.IS_IN_ONTOLOGY)) {
		return
	}

	const top_result = token.lookup_results.at(0)

	if (!top_result) {
		yield { token_to_flag: token, warning: "'{token}' is not recognized. Consult the How-To document or consider using a different word." }
		yield { token_to_flag: token, warning: 'WARNING: Because this word is not recognized, errors and warnings within the same clause may not be accurate.' }
		yield { token_to_flag: token, suggest: "Add '_noun', '_verb', '_adj', '_adv', '_adp', '_conj', or '_part' after the unknown word so the editor can check the syntax more accurately." }

	} else if (top_result.ontology_status === 'approved') {
		yield { token_to_flag: token, info: 'The {category} \'{stem}\' will be added to the Ontology in a future update. Consult the How-To document for more info.' }

	} else if (top_result.ontology_status === 'suggested') {
		yield { token_to_flag: token, error: 'The {category} \'{stem}\' is not in the Ontology, but discussion is ongoing. Hover over the word for potential hints from the How-To document.' }

	} else if (top_result.ontology_status === 'not used') {
		yield { token_to_flag: token, error: 'The {category} \'{stem}\' is not in the Ontology. Hover over the word for hints from the How-To document.' }

	} else if (top_result.ontology_status === 'unknown') {
		yield { token_to_flag: token, warning: 'The {category} \'{token}\' is not recognized. Consult the How-To document or consider using a different word.' }
	}
	
	if (top_result?.gloss.includes('DELETE')) {
		yield { token_to_flag: token, warning: 'The {category} {sense} is set to be removed from the Ontology. Hover over the word for possible alternatives.' }
	}
}
