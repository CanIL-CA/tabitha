import { TOKEN_TYPE } from '#lib/token.js'
import { parse_case_frame_rule, parse_sense_rules } from '../common'
import { by_adposition, by_clause_tag, by_complementizer, by_adposition_concept, by_relative_context, directly_after_verb, directly_after_verb_with_adposition, directly_before_verb, patient_from_subordinate_clause, predicate_adjective, with_be_auxiliary, with_no_double_patient } from './presets'
import type { Token } from '#lib/types.js'
import type {
	ArgumentRoleRule,
	ArgumentRulesForSense,
	CaseFrameRuleInfo,
	RoleRuleJson,
	RoleRuleValueJson,
	RoleTag,
	RoleUsageInfo,
	SenseRuleJson,
	VerbRoleTag,
	WordSense,
	WordStem,
} from '#lib/rules/case_frame/types.js'

const default_verb_case_frame_json: RoleRuleJson<VerbRoleTag> = {
	'agent': directly_before_verb(),
	'patient': {
		...directly_after_verb(),
		'comment': 'one of state or patient will be removed from the defaults depending on the stem (be/have use state instead of patient)',
	},
	'state': {
		...directly_after_verb(),
		'comment': 'one of state or patient will be removed from the defaults depending on the stem (be/have use state instead of patient)',
	},
	'source': {
		'trigger': { 'tag': { 'syntax': 'head_np' } },
		'context': { 'precededby': { 'token': 'from', 'type': TOKEN_TYPE.FUNCTION_WORD, 'skip': 'np_modifiers' } },
		'context_transform': { 'function': { 'pre_np_adposition': 'verb_argument' } },
		'missing_message': "'from X'",
		'comment': "Can't use by_adposition() because we also need to specify that 'from' has to be a function word. It's the same otherwise",
	},
	'destination': by_adposition('to'),
	'instrument': {
		'trigger': 'none',
		// TODO check feature on lexicon word like the Analyzer does. instruments have to be a thing, not a person
		'comment': 'An instrument is not present by default ("with" could mean other things as well)',
	},
	'beneficiary': {
		// TODO check feature on lexicon word like the Analyzer does. beneficiaries have to be animate, not things.
		// For now only accept proper names. Not a big deal because the beneficiary is never required, and could be used for most verbs.
		...by_relative_context({
			'followedby': [
				{ 'token': 'for', 'skip': 'all' },
				{ 'tag': { 'syntax': 'head_np' }, 'level': '4', 'skip': 'np_modifiers' },
			],
		}),
		'argument_context_index': 1,
		'context_transform': { 'function': { 'pre_np_adposition': 'verb_argument' } },
		'comment': '"for" could mean other things as well. TODO These should be set in the transform rules',
	},
	'agent_clause': by_clause_tag('agent_clause'),
	// These are extra argument types that are not directly detected by the 'categorization' value but
	// a sense may need a specific type of.
	'patient_clause_different_participant': by_clause_tag('patient_clause_different_participant'),
	'patient_clause_same_participant': by_clause_tag('patient_clause_same_participant'),
	'patient_clause_simultaneous': by_clause_tag('patient_clause_simultaneous'),
	'patient_clause_quote_begin': by_clause_tag('patient_clause_quote_begin'),
	'predicate_adjective': predicate_adjective(),
}

/**
 * These rules allow each verb sense to specify rules for each argument that is different from the default.
 * Only senses that differ from the default structure need to be included here.
 */
const verb_case_frames = new Map<WordStem, [WordSense, SenseRuleJson<VerbRoleTag>][]>([
	['accept', []],
	['act', []],
	['admit', []],
	['advise', [
		['advise-B', patient_from_subordinate_clause()],
	]],
	['affect', []],
	['agree', [
		['agree-A', { 'patient': directly_after_verb_with_adposition('with') }],
		['agree-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
		['agree-C', { 'patient': directly_after_verb_with_adposition('with') }],
	]],
	['allow', [
		['allow-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['announce', [
		['announce-A', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['answer', [
		['answer-A', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['appear', [
		['appear-B', {
			'patient': [
				directly_after_verb(),
				directly_after_verb_with_adposition('like'),
			],
		}],
	]],
	['approve', [
		['approve-A', {
			'patient': [
				directly_after_verb(),
				directly_after_verb_with_adposition('of'),
			],
		}],
	]],
	['argue', [
		['argue-A', {
			'patient': by_adposition('with'),
			'destination': by_adposition('about'),
		}],
		['argue-B', {
			'patient': by_adposition('with'),
			'patient_clause_different_participant': by_complementizer('about'),
		}],
	]],
	['arrive', [
		['arrive-A', { 'patient': directly_after_verb_with_adposition('at|in') }],
	]],
	['attach', [
		['attach-A', { 'instrument': by_adposition('with') }],
	]],
	['ask', [
		['ask-A', {
			'patient': {
				'trigger': { 'category': 'Noun' },
				'context': {
					'precededby': { 'category': 'Verb', 'skip': ['vp_modifiers', 'np'] },
					'notfollowedby': { 'category': 'Noun', 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' },
				},
				'transform': { 'tag': { 'role': 'patient' } },
			},
			'destination': [
				by_adposition('to'),
				{
					'trigger': { 'category': 'Noun' },
					'context': {
						'precededby': { 'category': 'Verb', 'skip': ['vp_modifiers', 'np_modifiers'] },
						'followedby': { 'category': 'Noun', 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' },
					},
					'transform': { 'tag': { 'role': 'destination' } },
					'comment': 'could be between the verb and the patient',
				},
			],
			'comment': 'can be "ask Patient" or "ask Destination Patient" or technically "ask Patient to Destination"',
		}],
		['ask-B', {
			'destination': directly_after_verb(),
			'patient': by_adposition('for'),
		}],
		['ask-C', patient_from_subordinate_clause()],
		['ask-D', {
			'destination': directly_after_verb(),
			'patient': by_adposition('about'),
		}],
		['ask-E', { 'patient_clause_type': 'patient_clause_quote_begin' }],
		['ask-F', {
			'patient_clause_different_participant': [
				{
					...by_clause_tag('patient_clause_different_participant'),
					'missing_message': "'[(if//whether) ...]', with or without the if/whether",
				},
				by_complementizer('if|whether'),
			],
			'comment': "This can be written as 'asked X [(if//whether) ...]', with or without the if/whether",
		}],
	]],
	['attack', []],
	['avoid', []],
	['be', [
		['be-D', {
			'other_required': 'predicate_adjective',
			'other_optional': 'patient_clause_same_participant|patient_clause_different_participant',
			'comment': 'some predicate adjectives take a patient clause, so those should be recognized and accepted',
		}],
		['be-E', {
			'agent': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': {
					'precededby': [
						{ 'tag': { 'syntax': 'existential' }, 'skip': 'vp_modifiers' },
						{ 'category': 'Verb', 'skip': ['vp_modifiers', 'np_modifiers'] },
					],
				},
				'missing_message': "'there be X'",
			},
			'state': { 'trigger': 'none' },
		}],
		['be-F', {
			'state': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': { 'precededby': { 'category': 'Adposition', 'skip': 'np_modifiers' } },
			},
		}],
		['be-G', {
			'state': directly_after_verb_with_adposition('for'),
			'beneficiary': { 'trigger': 'none' },
		}],
		['be-H', {
			'state': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': { 'precededby': { 'category': 'Adposition', 'skip': 'np_modifiers' } },
			},
		}],
		['be-I', {
			'state': directly_after_verb_with_adposition('with'),
		}],
		['be-J', {
			'agent': {
				...directly_before_verb({ 'stem': 'date' }),
				'missing_message': "write 'The date be X'",
			},
		}],
		['be-K', {
			'agent': {
				...directly_before_verb({ 'stem': 'name' }),
				'missing_message': "write 'X's name be Y' or 'The name of X be Y'",
			},
		}],
		['be-N', {
			'agent': {
				...directly_before_verb({ 'stem': 'time' }),
				'missing_message': "write 'The time be X' where X is a temporal noun like 4PM or morning",
			},
		}],
		['be-O', {
			'agent': {
				...directly_before_verb({ 'stem': 'weather' }),
				'missing_message': "write 'The weather be X' where X can be a noun (eg rain) or adjective (eg hot)",
			},
			'other_optional': 'predicate_adjective',
		}],
		['be-P', {
			'state': directly_after_verb_with_adposition('about'),
		}],
		['be-Q', {
			'state': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': { 'precededby': { 'category': 'Verb', 'skip': ['vp_modifiers', 'np_modifiers', { 'token': 'made' }] } },
			},
			'comment': 'there may or may not be "made of" before the np',
		}],
		['be-R', {
			'state': {
				...directly_after_verb_with_adposition('part'),
				'missing_message': "'X be part of Y'",
			},
		}],
		['be-S', {
			'predicate_adjective': {
				'trigger': { 'stem': 'old' },
				'context': { 'precededby': [{ 'category': 'Adjective' }, { 'stem': 'year|month|day' }] },
				'missing_message': "'be X years//months//etc old(-B)'",
			},
			'other_required': 'predicate_adjective',
			'comment': "clear the 'state' argument so it doesn't get triggered by 'year/month/day' etc. 'old' is the predicate adjective.",
		}],
		['be-T', {
			'state': directly_after_verb_with_adposition('from'),
			'source': { 'trigger': 'none' },
		}],
		['be-U', { 'state': directly_after_verb_with_adposition('like') }],
		['be-V', { 'other_required': 'predicate_adjective' }],
		['be-W', { 'state': directly_after_verb_with_adposition('in') }],
		['be-X', { 'state': directly_after_verb() }],
	]],
	['beat', [
		['beat-A', { 'instrument': by_adposition('with') }],
	]],
	['become', [
		['become-A', {
			'other_required': 'predicate_adjective',
			'other_optional': 'patient_clause_same_participant|patient_clause_different_participant',
			'comment': 'some predicate adjectives take a patient clause, so those should be recognized and accepted',
		}],
		['become-F', {
			'agent': {
				...directly_before_verb({ 'stem': 'weather' }),
				'missing_message': "write 'The weather be X' where X can be a noun (eg rain) or adjective (eg hot)",
			},
			'other_optional': 'predicate_adjective',
		}],
		['become-G', { 'state': directly_after_verb_with_adposition('like') }],
		['become-H', {
			'state': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': { 'precededby': { 'category': 'Verb', 'skip': ['vp_modifiers', 'np_modifiers', { 'token': 'made' }] } },
			},
			'comment': 'there may or may not be "made of" before the np',
		}],
		['become-I', {
			'state': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': { 'precededby': { 'category': 'Adposition', 'skip': 'np_modifiers' } },
			},
		}],
		['become-J', {
			'state': [
				directly_after_verb(),
				directly_after_verb_with_adposition('like'),
			],
		}],
	]],
	['beg', [
		['beg-C', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['begin', []],
	['believe', [
		['believe-B', { 'patient': directly_after_verb_with_adposition('in') }],
	]],
	['belong', []],
	['birth', [
		['birth-A', {
			'patient': [
				// 'X birthed Y' OR 'X gave birth to Y'
				directly_after_verb(),
				directly_after_verb_with_adposition('to'),
			],
			'destination': { },	// clear the rule so the 'to' doesn't trigger it
		}],
	]],
	['blame', [
		['blame-A', patient_from_subordinate_clause()],
		['blame-C', {
			'patient_clause_different_participant': [
				by_complementizer('for'),
				by_clause_tag('patient_clause_different_participant'),
			],
		}],
	]],
	['blow', []],
	['born', [
		['born-A', with_be_auxiliary()],
	]],
	['borrow', []],
	['break', [
		['break-A', { 'destination': by_adposition('to|into') }],
	]],
	['breathe', [
		['breathe-B', { 'destination': by_adposition('to|into') }],
	]],
	['bring', []],
	['build', []],
	['burn', [
		['burn-A', { 'instrument': by_adposition('with') }],
	]],
	['bury', [
		['bury-A', { 'destination': by_adposition('in') }],
	]],
	['buy', [
		['buy-A', { 'instrument': by_adposition('with|for') }],
	]],
	['call', [
		['call-A', { 'state': { 'trigger': 'none' } }],
		['call-B', {
			'state': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': { 'precededby': { 'tag': { 'syntax': 'head_np' } } },
				'comment': 'The state is a single word that immediately follows the patient. eg. "Paul called that child(P) John(S)."',
			},
		}],
		['call-C', {
			'state': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': { 'precededby': { 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' } },
				'comment': 'The state is an NP that immediately follows the patient. eg. "Jesus called the temple(P) the house(S) of God."',
			},
		}],
	]],
	['care', [
		['care-A', { 'patient': directly_after_verb_with_adposition('for|of') }],
		['care-B', { 'patient': directly_after_verb_with_adposition('about') }],
		['care-C', { 'patient': directly_after_verb_with_adposition('for|of') }],
	]],
	['carry', [
		['carry-A', {
			'destination': by_adposition('to|into'),
			'instrument': by_adposition('with'),
		}],
	]],
	['carry', [
		['carry-B', { 'instrument': by_adposition('with') }],
		['carry-C', { 'instrument': by_adposition('with') }],
		['carry-E', { 'instrument': by_adposition('with') }],
	]],
	['catch', [
		['catch-B', { 'instrument': by_adposition('with') }],
		['catch-C', { 'instrument': by_adposition('with') }],
	]],
	['cause', []],
	['celebrate', [
		['celebrate-A', { 'instrument': by_adposition('with') }],
		['celebrate-B', {
			'destination': by_adposition('until'),
			'instrument': by_adposition('with'),
		}],
	]],
	['change', [
		['change-A', { 'patient': directly_after_verb_with_adposition('into') }],
		['change-B', {
			'patient': by_adposition('about'),
			'other_rules': {
				'mind': {
					...directly_after_verb({ 'stem': 'mind' }),
					'transform': { 'function': { 'syntax': 'extra_patient' } },
					'missing_message': "write 'change X's mind'",
				},
			},
			'other_required': 'mind',
			'comment': "'mind' can be included in the phase 1 (eg. Pharoah changed Pharoah's mind) but it is not included in the semantic representation.",
		}],
		['change-C', { 'destination': by_adposition('to|into') }],
		['change-E', { 'destination': by_adposition('to|into') }],
	]],
	['chase', []],
	['chase-away', []],
	['choose', [
		['choose-B', patient_from_subordinate_clause()],
		['choose-C', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['close', []],
	['come', []],
	['come-out', [
		['come-out-A', { 'source': by_adposition('from|of') }],
	]],
	['command', [
		['command-A', {
			...patient_from_subordinate_clause(),
			'instrument': by_adposition('with'),
		}],
		['command-B', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['complain', [
		['complain-A', { 'patient': by_adposition('about') }],
	]],
	['contain', []],
	['cost', []],
	['cover', [
		['cover-A', { 'instrument': by_adposition('with') }],
		['cover-B', { 'instrument': by_adposition('with') }],
	]],
	['cry-out', [
		['cry-out-A', { 'patient': by_adposition('about') }],
		['cry-out-B', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['decide', [
		['decide-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['demand', [
		['demand-B', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['deserve', [
		['deserve-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
		['deserve-C', {
			'patient_clause_different_participant': [
				by_clause_tag('patient_clause_different_participant'),
				by_complementizer('for'),	// 'John didn't deserve [for Jesus to come].'
			],
		}],
	]],
	['die', []],
	['discover', []],
	['divide', [
		['divide-A', {
			'destination': by_adposition('into'),	// divided the kingdom into regions
			'instrument': by_adposition('with'),
			'beneficiary': by_adposition('among'),	// divided the lang among the tribes
		}],
		['divide-B', { 'patient': by_adposition('into') }],
	]],
	['dream', [
		['dream-A', { 'patient': by_adposition('about') }],
	]],
	['do', []],
	['doubt', []],
	['drop', [
		['drop-A', { 'destination': by_adposition_concept('to|on|into') }],
	]],
	['eat', [
		['eat-A', { 'instrument': by_adposition('with') }],
	]],
	['encourage', [
		['encourage-B', patient_from_subordinate_clause()],
	]],
	['end', [
		['end-B', { 'destination': by_adposition('at') }],
	]],
	['enjoy', [
		['enjoy-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['escape', []],
	['expect', [
		['expect-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['explain', []],
	['explain-how', []],
	['fail', [
		['fail-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['fall', [
		['fall-A', { 'destination': by_adposition_concept('to|on|into') }],
		['fall-B', { 'destination': by_adposition_concept('to|on|into') }],
		['fall-D', { 'destination': by_adposition_concept('to|on|into') }],
		['fall-E', { 'destination': by_adposition_concept('to|on|into') }],
	]],
	['fight', [
		['fight-A', {
			'patient': [
				directly_after_verb(),
				by_adposition('against|with'),
			],
			'instrument': {
				...by_adposition('with'),
				'trigger': { 'tag': { 'syntax': 'head_np' }, 'level': '0|1|2|3' },	// the instrument can't be a level 4 word (proper name)
			},
		}],
		['fight-B', { 'instrument': by_adposition('with') }],
	]],
	['find-out', [
		['find-out-B', {
			'patient': [
				directly_after_verb(),
				by_adposition('about'),
			],
		}],
	]],
	['follow', []],
	['forget', [
		['forget-A', { 'patient': by_adposition('about') }],
		['forget-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['forgive', [
		['forgive-C', {
			'destination': by_adposition('for'),
			'beneficiary': { },
		}],
		['forgive-D', patient_from_subordinate_clause()],
	]],
	['gather', [
		['gather-B', { 'instrument': by_adposition('with') }],
	]],
	['give', [
		['give-A', with_no_double_patient()],
		['give-B', with_no_double_patient()],
		['give-C', with_no_double_patient()],
	]],
	['go', []],
	['grow', [
		['grow-B', {
			'other_rules': {
				'up': {
					...by_relative_context({ 'followedby': { 'token': 'up' } }),
					'context_transform': { 'function': { 'pre_np_adposition': 'verb_argument' } },
					'tag_role': false,
				},
			},
			'other_optional': 'up',
			'comment': 'The boys grew up. OR The boys grew-B.',
		}],
	]],
	['hang', [
		['hang-B', { 'destination': by_adposition('on') }],
		['hang-C', { 'destination': by_adposition('on') }],
	]],
	['hate', [
		['hate-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['have', [
		['have-J', { 'instrument': by_adposition('with') }],
	]],
	['hear', [
		['hear-A', { 'instrument': by_adposition('with') }],
		['hear-B', { 'instrument': by_adposition('with') }],
		['hear-C', { 'other_optional': 'patient_clause_simultaneous' }],
		['hear-D', { 'patient': by_adposition('about') }],
	]],
	['help', [
		['help-B', patient_from_subordinate_clause()],
	]],
	['hide', [
		['hide-A', { 'destination': by_adposition_concept() }],
	]],
	['hope', [
		['hope-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['hurt', [
		['hurt-C', with_be_auxiliary()],
	]],
	['increase', []],
	['invite', [
		['invite-A', patient_from_subordinate_clause()],
	]],
	['join', []],
	['keep', [
		['keep-A', { 'destination': by_adposition_concept('in') }],
		['keep-C', { 'destination': by_adposition('in') }],
	]],
	['kill', []],
	['know', [
		['know-D', { 'patient': directly_after_verb_with_adposition('about') }],
		['know-B', { 'instrument': by_adposition('with') }],
	]],
	['know-how', [
		['know-how-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['laugh', [
		['laugh-B', { 'patient': directly_after_verb_with_adposition('at') }],
	]],
	['lead', []],
	['learn', [
		['learn-C', { 'patient': directly_after_verb_with_adposition('about') }],
	]],
	['learn-how', [
		['learn-how-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['leave', []],
	['let', []],
	['lie', []],
	['lift', []],
	['like', [
		['like-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['listen', [
		['listen-A', {
			'patient': directly_after_verb_with_adposition('to'),
			'destination': { },
		}],
		['listen-B', {
			'patient': directly_after_verb_with_adposition('to'),
			'destination': { },
		}],
	]],
	['live', [
		['live-A', {
			'destination': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': {
					'precededby': [
						{ 'category': 'Verb', 'skip': 'vp_modifiers' },
						{ 'category': 'Adposition', 'skip': 'np_modifiers' },
					],
					'notprecededby' : { 'token': 'with|for', 'skip': 'np_modifiers' },
				},
				'comment': 'Could have any adposition except with/for (eg "in Egypt", "along the Nile", "by the river", etc)',
			},
		}],
		['live-B', {
			'other_rules': {
				'lifespan_oblique': {
					'trigger': { 'tag': { 'syntax': 'head_np' } , 'stem': 'year|time' },
					'context': { 'precededby': { 'token': 'for', 'skip': 'np_modifiers' } },
					'tag_role': false,
					'comment': 'eg Adam lived for 930 years',
				},
			},
			'other_optional': 'lifespan_oblique',
		}],
		['live-C', {
			'other_rules': {
				'just_like_clause': {
					...by_clause_tag('adverbial_clause'),
					'context': {
						'subtokens': { 'stem': 'just-like', 'skip': { 'token': '[' } },
					},
					'tag_role': false,
					'comment': 'this is not an argument, but used for sense selection',
				},
			},
			'other_optional': 'just_like_clause',
		}],
	]],
	['lock', [
		['lock-B', with_be_auxiliary()],
	]],
	['look', [
		['look-A', { 'patient': directly_after_verb_with_adposition('at') }],
		['look-B', { 'other_required': 'predicate_adjective' }],	// X looked happy/sad/excited
	]],
	['make', [
		['make-A', { 'instrument': by_adposition('with') }],
		['make-C', {
			// Possible accepted formats:
			// Gen 22:16 make a promise [in my name](instrument).
			// Gen 6:18 God made a covenant [with Noah](destination). (specific to 'covenant', usually 'to' indicates destination)
			// Daniel 12:7 That man made a promise [by God](instrument). (not recognized in Analyzer but valid phase 1)
			'instrument': [
				{
					...by_adposition('by'),
					'trigger': { 'tag': { 'syntax': 'head_np' }, 'stem': 'God|Yahweh' },
				},
				{
					...by_adposition('in'),
					'trigger': { 'tag': { 'syntax': 'head_np' }, 'stem': 'name' },
				},
			],
			'destination': [
				by_adposition('to'),
				{
					'trigger': { 'tag': { 'syntax': 'head_np' } },
					'context': { 'precededby': [{ 'stem': 'covenant' }, { 'token': 'with', 'skip': 'np_modifiers' }] },
					'context_transform': [{}, { 'function': { } }],
				},
			],
		}],
		['make-E', { 'instrument': by_adposition('with') }],
	]],
	['marry', [
		['marry-B', with_be_auxiliary()],
	]],
	['mean', [
		['mean-A', { 'other_optional': 'predicate_adjective' }],
		['mean-D', {
			'patient_clause_type': 'patient_clause_same_participant',
			'comment': "'X means [to go]' - technically just an infinitive verb, but looks like a 'same participant' clause",
		}],
		['mean-E', { 'other_optional': 'patient_clause_different_participant' }],
	]],
	['move', []],
	['need', [
		['need-C', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['notice', [
		['notice-A', { 'other_optional': 'patient_clause_simultaneous' }],
	]],
	['offer', [
		['offer-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['open', []],
	['order', [
		['order-A', patient_from_subordinate_clause()],
	]],
	['pass', []],
	['pay', []],
	['persuade', [
		['persuade-A', patient_from_subordinate_clause()],
	]],
	['plan', [
		['plan-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
		['plan-C', {
			'patient_clause_different_participant': [
				by_clause_tag('patient_clause_different_participant'),
				by_complementizer('for'),
			],
			'comment': "eg. 'John planned [for Mary to come].'",
		}],
	]],
	['please', []],
	['point', [
		['point-A', {
			'patient': directly_after_verb_with_adposition('to'),
			'destination': { },	// clear the destination so it doesn't get confused with the patient
		}],
		['point-B', { 'patient': directly_after_verb_with_adposition('at') }],
		['point-C', { 'destination': by_adposition('to|at') }],
	]],
	['pour', [
		['pour-A', { 'destination': by_adposition_concept('in|into|on') }],
	]],
	['pour-out', [
		['pour-out-B', { 'destination': by_adposition('on|onto') }],
	]],
	['praise', []],
	['pray', [
		['pray-A', { 'patient': by_adposition('about') }],
		['pray-C', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['prepare', [
		['prepare-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['prevent', []],
	['promise', [
		['promise-A', { 'instrument': by_adposition('with') }],
		['promise-B', {
			'instrument': by_adposition('with'),
			'patient_clause_type': 'patient_clause_quote_begin',
		}],
	]],
	['protect', [
		['protect-B', patient_from_subordinate_clause()],
	]],
	['pull', [
		['pull-B', { 'destination': by_adposition('in|into|onto') }],
	]],
	['put', [
		['put-A', { 'destination': by_adposition_concept() }],
	]],
	['read', [
		['read-B', { 'patient': by_adposition('about') }],
	]],
	['return', []],
	['refuse', [
		['refuse-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['remember', [
		['remember-E', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['remind', [
		['remind-A', {
			'destination': directly_after_verb(),
			'patient': { },
		}],
		['remind-B', patient_from_subordinate_clause()],
		['remind-C', { 'destination': by_adposition('about') }],
	]],
	['reply', [
		['reply-A', {
			'patient': by_adposition('to'),
			'destination': { },
			'patient_clause_type': 'patient_clause_quote_begin',
		}],
		['reply-B', {
			'patient': by_adposition('to'),
			'destination': { },
		}],
	]],
	['run', []],
	['save', []],
	['say', [
		['say-A', {
			'patient': by_adposition('to'),
			'destination': { },
			'patient_clause_type': 'patient_clause_quote_begin',
		}],
		['say-C', {
			'patient': by_adposition('to'),
			'destination': { },
		}],
		['say-E', { 'patient_clause_type': 'patient_clause_quote_begin' }],
		['say-F', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['scream', []],
	['search', [
		['search-A', {
			'patient': directly_after_verb_with_adposition('for'),
			'destination': by_adposition('in'),
			'comment': 'eg. Genesis 44:12 The servant searched [for the cup(P)] [in the bags(d)].',
		}],
	]],
	['see', [
		['see-B', { 'other_optional': 'patient_clause_simultaneous' }],
	]],
	['seem', [
		['seem-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
		['seem-C', { 'patient': directly_after_verb_with_adposition('like') }],
	]],
	['sell', [
		['sell-A', {
			'instrument': {
				...by_adposition('for'),
				'trigger': { 'tag': { 'syntax': 'head_np' }, 'level': '0|1' },
				'comment': "don't confuse the instrument with a beneficiary, which currently must be level 4",
			},
		}],
	]],
	['send', [
		['send-A', with_no_double_patient()],
		['send-B', with_no_double_patient()],
		['send-C', with_no_double_patient()],
	]],
	['separate', []],
	['shine', [
		['shine-B', { 'destination': by_adposition('on|onto') }],
	]],
	['shoot', [
		['shoot-B', { 'destination': by_adposition('to|at') }],
	]],
	['shout', [
		['shout-A', {
			'patient': by_adposition('to'),
			'destination': { },
			'patient_clause_type': 'patient_clause_quote_begin',
		}],
		['shout-B', { 'destination': by_adposition('to|at') }],
		['shout-C', { 'destination': by_adposition('to|at') }],
	]],
	['show', []],
	['show-how', [
		['show-how-A', {
			'patient': [
				directly_after_verb(),
				by_clause_tag('patient_clause_different_participant'),
			],
			'comment': "support both 'show-how [Y V]' or 'show-how Y [Y V]'",
		}],
	]],
	['sing', [
		['sing-A', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['speak', [
		['speak-A', {
			'patient': by_adposition('about'),
			'instrument': by_adposition('in'),	// in a language
			'other_rules': {
				'extra_patient': {
					...directly_after_verb(),
					'extra_message': 'speak-A cannot be used with a regular object. The patient is expressed as \'speak about X\'',
				},
			},
		}],
	]],
	['smell', [
		['smell-B', { 'other_optional': 'predicate_adjective' }],
		['smell-C', { 'patient': directly_after_verb_with_adposition('like') }],
	]],
	['sound-like', [
		['sound-like-A', { 'destination': by_adposition('in') }],
		['sound-like-B', { 'destination': by_adposition('in') }],
	]],
	['spill', [
		['spill-A', { 'destination': by_adposition('on') }],
	]],
	['sprinkle', [
		['sprinkle-A', { 'destination': by_adposition('on') }],
	]],
	['start', []],
	['struggle', [
		['struggle-A', { 'patient': by_adposition('with|against') }],
	]],
	['suggest', []],
	['take', []],
	['take-away', []],
	['talk', [
		['talk-A', { 'patient': by_adposition('about') }],
		['talk-B', {
			'patient_clause_different_participant': [
				by_clause_tag('patient_clause_different_participant'),
				by_complementizer('about'),
			],
			'comment': "eg. 'John talked about Mary dancing.'",
		}],
	]],
	['taste', [
		['taste-B', {
			'patient': by_adposition('like'),
			'other_optional': 'predicate_adjective',
			'comment': 'eg. "The soup tastes like chicken" or "The soup tastes bitter"',
		}],
	]],
	['teach', [
		['teach-A', {
			'destination': directly_after_verb(),
			'patient': by_adposition('about'),
		}],
		['teach-D', patient_from_subordinate_clause()],
	]],
	['teach-how', [
		['teach-how-A', {
			'patient': [
				directly_after_verb(),
				by_clause_tag('patient_clause_different_participant'),
			],
			'comment': "support both 'teach-how [Y V]' or 'teach-how Y [Y V]'",
		}],
	]],
	['tear', [
		['tear-A', { 'destination': by_adposition('to|into') }],
	]],
	['thank', [
		['thank-A', { 'destination': by_adposition('for') }],
	]],
	['tell', [
		['tell-A', {
			'instrument': by_adposition('with'),
			'patient_clause_different_participant': by_clause_tag('patient_clause_different_participant|relative_clause_that'),
			'comment': 'the patient clause may have been interpreted as a relative clause if \'that\' was present',
		}],
		['tell-B', patient_from_subordinate_clause()],
		['tell-C', {
			'destination': directly_after_verb(),
			'instrument': by_adposition('with'),
			'patient': by_adposition('about'),
		}],
		['tell-D', { 'instrument': by_adposition('with') }],
		['tell-E', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['think', [
		['think-A', { 'patient': by_adposition('about') }],
		['think-B', { 'patient_clause_type': 'patient_clause_quote_begin' }],
		['think-D', {
			'patient_clause_same_participant': {
				...by_clause_tag('patient_clause_same_participant'),
				'context': {
					'precededby': { 'token': 'about' },
				},
				'context_transform': { 'function': {} },
				'missing_message': "write 'think about [Verb-ing]'",
			},
			'patient_clause_different_participant': {
				...by_clause_tag('patient_clause_different_participant'),
				'extra_message': "think-D should be written in the format 'think about [Verb-ing]'",
			},
			'patient_clause_type': 'patient_clause_same_participant',
		}],
	]],
	['throw', [
		['throw-A', { 'destination': by_adposition('at') }],
		['throw-B', {
			'destination': by_adposition('into'),
			'source': {
				'trigger': { 'tag': { 'syntax': 'head_np' } },
				'context': {
					'precededby': [
						{ 'token': 'out' },
						{ 'token': 'of', 'skip': 'np_modifiers' },
					],
				},
				'context_transform': [
					{ 'function': { 'syntax': 'verbal_adposition' } },
					{ 'tag': { 'pre_np_adposition': 'verb_argument' }, 'remove_tag': 'relation' },
				],
			},
		}],
		['throw-E', { 'destination': by_adposition('into|on|at') }],
	]],
	['tie', [
		['tie-A', { 'instrument': by_adposition('with') }],
		['tie-B', {
			...with_be_auxiliary(),
			'instrument': by_adposition('with'),
		}],
		['tie-C', { 'instrument': by_adposition('with') }],
	]],
	['trust', [
		['trust-A', {
			'patient': by_adposition('in'),
			'instrument': by_adposition('with'),
		}],
		['trust-B', { 'instrument': by_adposition('with') }],
		['trust-C', { 'instrument': by_adposition('with') }],
		['trust-D', patient_from_subordinate_clause()],
	]],
	['try', [
		['try-A', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['turn', []],
	['understand', [
		['understand-C', {
			'patient_clause_type': 'patient_clause_same_participant',
			'patient_clause_same_participant': [
				by_clause_tag('patient_clause_same_participant'),
				{
					'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'patient_clause_different_participant|adverbial_clause' } },
					'context': {
						'subtokens': [{ 'token': 'how', 'skip': 'clause_start' }, { 'token': 'to' }],
					},
					'transform': { 'tag': { 'clause_type': 'patient_clause_same_participant', 'role': 'patient_clause_same_participant' } },
					'subtoken_transform': { 'function': { 'syntax': 'complementizer' } },
					'missing_message': "'[(how) to...]'",
				},
			],
			'patient_clause_different_participant': {},
			'comment': "'John understood [how to dance].' OR 'John understood [to dance].'",
		}],
	]],
	['unite', [
		['unite-B', { 'destination': by_adposition('to|with') }],
		['unite-C', {
			'patient': by_adposition('to|with'),
			'destination': { },
		}],
	]],
	['wait', [
		['wait-B', {
			'patient_clause_same_participant': [
				by_clause_tag('patient_clause_same_participant'),
				by_complementizer('for'),
			],
			'comment': "'John waited [for Mary to come].' OR 'John waited [Mary to come].'",
		}],
		['wait-C', {
			'patient': {
				...by_adposition('for'),
				'trigger': { 'tag': { 'syntax': 'head_np' }, 'level': '4' },
			},
			'beneficiary': { },
		}],
		['wait-D', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['want', [
		['want-B', { 'patient_clause_type': 'patient_clause_same_participant' }],
	]],
	['walk', []],
	['warn', [
		['warn-A', {
			'patient': [
				directly_after_verb(),
				by_clause_tag('patient_clause_different_participant'),
			],
			'comment': "support both 'warn [Y V]' or 'warn Y [Y V]'",
		}],
		['warn-C', { 'destination': by_adposition('about') }],
		['warn-D', { 'patient_clause_type': 'patient_clause_quote_begin' }],
	]],
	['watch', [
		['watch-A', { 'other_optional': 'patient_clause_simultaneous' }],
	]],
	['watch-out', [
		['watch-out-A', { 'patient': by_adposition('for') }],
	]],
	['weigh', []],
	['work', [
		['work-A', { 'instrument': by_adposition('with') }],
	]],
	['worry', [
		['worry-A', {
			...with_be_auxiliary(),
			'patient': directly_after_verb_with_adposition('about'),
		}],
		['worry-B', with_be_auxiliary()],
	]],
	['wrap', [
		['wrap-A', { 'instrument': by_adposition('with') }],
	]],
	['write', [
		['write-A', { 'instrument': by_adposition('with') }],
		['write-B', { 'instrument': by_adposition('with') }],
		['write-C', {
			'patient': by_adposition('about'),
			'patient_clause_type': 'patient_clause_quote_begin',
		}],
		['write-D', {
			'patient': by_adposition('about'),
		}],
		['write-E', {
			'patient_clause_different_participant': by_clause_tag('patient_clause_different_participant|relative_clause_that'),
			'comment': 'the patient clause may have been interpreted as a relative clause if \'that\' was present',
		}],
	]],
])

function create_default_argument_rules(): ArgumentRoleRule[] {
	return Object.entries(default_verb_case_frame_json)
		.flatMap(([role_tag, rule_json]) => parse_case_frame_rule({ sense: 'verb_default', role_tag: role_tag as RoleTag, rule_json: rule_json as RoleRuleValueJson }))
}

function create_verb_argument_rules(): Map<WordStem, ArgumentRulesForSense[]> {
	return new Map([...verb_case_frames.entries()].map(([stem, sense_rules_json]) => {
		const defaults = get_default_rules_for_stem(stem)
		return [stem, parse_sense_rules({ rule_json: sense_rules_json, defaults })]
	}))
}

function get_default_rules_for_stem(stem: WordStem): ArgumentRoleRule[] {
	if (stem === 'call') {
		// 'call' is the only verb that can have both a patient and a state
		return DEFAULT_CASE_FRAME_RULES
	}

	const role_to_remove = ['be', 'become', 'have'].includes(stem) ? 'patient' : 'state'
	return DEFAULT_CASE_FRAME_RULES.filter(rule => rule.role_tag !== role_to_remove)
}

const DEFAULT_CASE_FRAME_RULES = create_default_argument_rules()
const VERB_CASE_FRAME_RULES = create_verb_argument_rules()

export function get_verb_case_frame_rules(token: Token): CaseFrameRuleInfo {
	const stem = token.lookup_results[0].stem
	const argument_rules_by_sense = VERB_CASE_FRAME_RULES.get(stem)

	// TODO use the default rules instead once more verb rules are added.
	if (!argument_rules_by_sense) {
		return {
			rules_by_sense: [],
			default_rule_getter: () => [],
			role_info_getter: (categorization, role_rules) => get_verb_usage_info({ categorization, role_rules }),
			should_check: false,
		}
	}

	return {
		rules_by_sense: argument_rules_by_sense,
		default_rule_getter: () => get_default_rules_for_stem(stem),
		role_info_getter: (categorization, role_rules) => get_verb_usage_info({ categorization, role_rules }),
		should_check: true,
	}
}

export function get_passive_verb_case_frame_rules(token: Token): CaseFrameRuleInfo {
	// for a passive, the 'patient' goes right before the verb and the 'agent' is detected by the adposition 'by'
	const passive_rules_json = {
		'patient': directly_before_verb(),
		'agent': by_adposition('by'),
	}
	const passive_rules = Object.entries(passive_rules_json)
		.flatMap(([role_tag, rule_json]) => parse_case_frame_rule({ sense: 'verb_passive', role_tag: role_tag as RoleTag, rule_json: rule_json as RoleRuleValueJson }))

	const active_rules = get_verb_case_frame_rules(token)
	return {
		...active_rules,
		rules_by_sense: active_rules.rules_by_sense
			.map(rules_for_sense => ({ ...rules_for_sense, role_rules: replace_passive_rules(rules_for_sense.role_rules) })),
		default_rule_getter: lookup => replace_passive_rules(active_rules.default_rule_getter(lookup)),
	}

	function replace_passive_rules(role_rules: ArgumentRoleRule[]): ArgumentRoleRule[] {
		return role_rules.filter(rule => !['patient', 'agent'].includes(rule.role_tag)).concat(passive_rules)
	}
}

const VERB_LETTER_TO_ROLE = new Map([
	['A', 'agent'],
	['B', 'patient'],
	['C', 'state'],
	['D', 'source'],
	['E', 'destination'],
	['F', 'instrument'],
	['G', 'beneficiary'],
	['H', 'patient_clause'],
	['I', 'agent_clause'],
])

function get_verb_usage_info({ categorization, role_rules: { other_optional, other_required, patient_clause_type } }: { categorization: string; role_rules: ArgumentRulesForSense }): RoleUsageInfo {
	const role_letters = [...categorization].filter(c => c !== '_')

	// some categorizations are blank (eg become-J)
	// treat all arguments as possible and not required
	// also accept any values specified in a role rule
	if (role_letters.length === 0) {
		return {
			possible_roles: [...Object.keys(default_verb_case_frame_json)],
			required_roles: other_required,
		}
	}

	// Replace 'patient_clause' with the appropriate clause type
	patient_clause_type = patient_clause_type || 'patient_clause_different_participant'

	const possible_roles = role_letters
		.map(c => VERB_LETTER_TO_ROLE.get(c.toUpperCase()))
		.map(role => role === 'patient_clause' ? patient_clause_type : role)
		.concat([...other_optional, ...other_required, 'beneficiary'])	// beneficiaries are always possible
		.filter((role): role is string => Boolean(role))

	const required_roles = role_letters
		.map(c => VERB_LETTER_TO_ROLE.get(c))
		// Replace 'patient_clause' with the appropriate clause type
		.map(role => role === 'patient_clause' ? patient_clause_type : role)
		.filter(role => role !== 'beneficiary')	// beneficiaries are never required
		.concat(other_required)
		.filter((role): role is string => Boolean(role))

	return { possible_roles, required_roles }
}

// TODO add check for questions and relative clauses
