import { ERRORS } from '#lib/parser/error_messages.js'
import { create_context_filter, create_token_filter, from_built_in_rule, message_set_action, simple_rule_action } from './rules_parser'
import { TOKEN_TYPE, create_lookup_result, is_one_part_of_speech } from '#lib/token.js'
import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
import type { Token } from '#lib/types.js'
import type {
	BuiltInRule,
	PartOfSpeechRuleJson,
	RuleAction,
	TokenFilter,
	TokenRule,
} from '#lib/rules/types.js'
import type { PartOfSpeech } from '@tabitha/types'

/**
 * These rules are designed to disambiguate words that could be multiple parts of speech.
 * E.g. guard(N/V), command(N/V), pleased(V/Adj), well(N/Adj/Adv).
 */
const part_of_speech_rules_json = [
	{
		'name': 'If Noun-Verb preceded by article or demonstrative, remove the Verb',
		'category': 'Noun|Verb',
		'context': {
			'precededby': {
				'tag': 'determiner',
				'skip': { 'category': 'Adjective' },
			},
		},
		'remove': 'Verb',
		'comment': 'Definite Article: Daniel 3:4 I will read the command(N/V). Indefinite Article: Daniel 3:10 The king made a command(N/V). Near Demonstrative: Daniel 3:11 People who do not obey this command(N/V)... Remote Demonstrative: Daniel 5:17 You may give those rewards(N/V) to another person.  Remote-Demonstrative-Relativizer-Complmentizer:  Daniel 1:11 Daniel spoke to that guard(N/V).',
	},
	{
		'name': 'If Noun-Verb followed by article or demonstrative, remove the Noun',
		'category': 'Noun|Verb',
		'context': {
			'followedby': {
				'tag': 'determiner',
				'skip': { 'category': 'Adjective' },
			},
		},
		'remove': 'Noun',
		'comment': 'Daniel 1:5 The king allowed the men to drink(N/V) the king\'s wine.',
	},
	{
		'name': 'If Noun-Verb preceded by Negative Verb Polarity or Modal words, delete the Noun',
		'category': 'Noun|Verb',
		'context': {
			'precededby': { 'tag': 'verb_polarity|modal' },
		},
		'remove': 'Noun',
		'comment': 'I will judge(N/V). I do not judge(N/V). I should judge(N/V). etc',
	},
	{
		'name': 'If Noun-Verb preceded by an aspectual auxiliary, remove Noun',
		'category': 'Noun|Verb',
		'context': {
			'precededby': { 'stem': 'start|begin|stop|continue|finish', 'skip': { 'token': 'to' } },
		},
		'remove': 'Noun',
		'comment': 'People will continue to hope(N/V) in Christ Jesus.',
	},
	{
		'name': 'If Noun-Verb preceded by Adjective or Conjunction, delete the Verb',
		'category': 'Noun|Verb',
		'context': {
			'precededby': { 'category': 'Adjective|Conjunction' },
		},
		'remove': 'Verb',
		'comment': 'Preceded by an Adjective: Daniel 1:7 The official gave new names(N/V) to the men... Preceded by a Conjunction: Because we don\'t allow coordinate VPs in these propositions, if there\'s a Conjunction preceding the Noun/Verb, the word must be a Noun. Daniel 2:37 God has given wealth and honor(N/V) to you.',
	},
	{
		'name': 'If certain Noun/Verbs are preceded by chief, remove the Verb',
		'category': 'Noun|Verb',
		'trigger': { 'stem': 'stone|guard|judge' },
		'context': {
			'precededby': { 'stem': 'chief' },
		},
		'remove': 'Verb',
		'comment': 'Jesus is-X the chief(N/Adj) stone(N/V). stone, judge, guard, etc will not be disambiguated properly otherwise',
	},
	{
		'name': 'If Noun-Verb preceded by certain Adpositions, delete the Verb',
		'category': 'Noun|Verb',
		'context': {
			'precededby': { 'token': 'from|with' },
		},
		'remove': 'Verb',
		'comment': '',
	},
	{
		'name': 'If Noun-Verb preceded by a relation, delete the Verb',
		'category': 'Noun|Verb',
		'context': {
			'precededby': { 'tag': 'relation', 'skip': 'adjp_attributive' },
		},
		'remove': 'Verb',
		'comment': 'Gideon returned to the Israelite\'s camp.',
	},
	{
		'name': 'If Noun-Verb preceded by a Noun, delete the Noun',
		'category': 'Noun|Verb',
		'context': {
			'precededby': { 'category': 'Noun' },
		},
		'remove': 'Noun',
		'comment': 'Daniel 3:9  I(astrologer) hope(N/V) that...',
	},
	{
		'name': 'If Noun-Verb followed by a Noun, delete the Noun',
		'category': 'Noun|Verb',
		'context': {
			'followedby': { 'category': 'Noun', 'skip': 'np_modifiers' },
			'notfollowedby': { 'token': 'of' },
		},
		'remove': 'Noun',
		'comment': '"The people [that are in the tribe named Levi] saw(N/V) Mary." This only works because cases like "the judge\'s(N/V) house" are handled earlier.',
	},
	{
		'name': 'If Noun-Verb preceded by Verb, delete the Verb',
		'category': 'Noun|Verb',
		'context': {
			'precededby': { 'category': 'Verb' },
		},
		'remove': 'Verb',
		'comment': 'Preceded by a Verb: Daniel 3:2 people that collect tax(N/V)... Sometimes wrongly selects Noun when preceded by "be": You(people) should be teaching(N/V) other people about those things. (handled in a hard-coded rule)',
	},
	{
		'name': 'If Adposition-Conjunction "so/instead" is the first word of a sentence, remove Adposition',
		'category': 'Adposition|Conjunction',
		'trigger': { 'tag': { 'position': 'first_word' }, 'stem': 'so|instead' },
		'remove': 'Adposition',
		'comment': 'only for \'so\'. \'for\' might be the \'for each...\' sense',
	},
	{
		'name': 'If Adposition-Conjunction is the first word of a (non-quote) subordinate clause, remove Conjunction',
		'category': 'Adposition|Conjunction',
		'context': {
			'precededby': { 'token': '[', 'skip': { 'category': 'Conjunction' } },
		},
		'remove': 'Conjunction',
	},
	{
		'name': 'If Adposition-Conjunction "for" appears anywhere else in the sentence, remove Conjunction',
		'category': 'Adposition|Conjunction',
		'trigger': { 'token': 'for' },
		'remove': 'Conjunction',
		'comment': 'This relies on the fact the conjunction must be the first word and therefore capitalized',
	},
	{
		'name': 'If Adverb-Adjective followed by Noun, remove Adverb',
		'category': 'Adverb|Adjective',
		'context': {
			'followedby': { 'category': 'Noun' },
		},
		'remove': 'Adverb',
		'comment': 'Dan. 1:12 Please give only(Adj/Adv) vegetables ...  Paul like most(Adj/Adv) books.',
	},
	{
		'name': 'If Adverb-Adjective "hard" is preceded by "be/become", remove Adverb',
		'category': 'Adverb|Adjective',
		'trigger': { 'stem': 'hard' },
		'context': {
			'precededby': { 'stem': 'be|become', 'skip': 'adjp_modifiers_attributive' },
		},
		'remove': 'Adverb',
		'comment': 'Those things are hard(Adv/Adj) for John.',
	},
	{
		'name': 'If Adverb-Adjective "hard" is directly preceded by any other verb, remove Adjective',
		'category': 'Adverb|Adjective',
		'trigger': { 'stem': 'hard' },
		'context': {
			'precededby': { 'category': 'Verb' },
		},
		'remove': 'Adjective',
		'comment': 'John worked hard(Adv/Adj).',
	},
	{
		'name': 'If Adverb-Adjective followed by a Verb or Adposition, remove Adjective',
		'category': 'Adverb|Adjective',
		'context': {
			'followedby': { 'category': 'Verb|Adposition' },
		},
		'remove': 'Adjective',
		'comment': 'John only(Adv/Adj) saw a book.  Believe more(Adv/Adj) in Jesus.',
	},
	{
		'name': 'If Adverb-Adjective followed by "of", remove Adverb',
		'category': 'Adverb|Adjective',
		'context': {
			'followedby': { 'token': 'of' },
		},
		'remove': 'Adverb',
		'comment': 'John saw most(Adj/Adv) of those people.',
	},
	{
		'name': 'If Noun-Adjective followed by Noun, remove Noun',
		'category': 'Noun|Adjective',
		'context': {
			'followedby': { 'category': 'Noun', 'skip': 'adjp_attributive' },
		},
		'remove': 'Noun',
		'comment': 'Daniel 7:4 I saw the second(N/Adj) animal. The chief(N/Adj) evil spirit.',
	},
	{
		'name': 'If Noun-Adjective preceded by Adjective, remove Adjective',
		'category': 'Noun|Adjective',
		'context': {
			'precededby': { 'category': 'Adjective' },
		},
		'remove': 'Adjective',
		'comment': "eg. Daniel 1:3 'royal offical(N/Adj)'. eg. 'And God lives in extremely bright light(N/Adj).' This rule must be after the 'remove Noun if followed by a Noun' rule",
	},
	{
		'name': 'If Noun-Adjective is preceded by an article but not followed by Noun, remove Adjective',
		'category': 'Noun|Adjective',
		'context': {
			'precededby': {
				'tag': 'determiner',
				'skip': 'adjp_attributive',
			},
			'notfollowedby': { 'category': 'Noun', 'skip': 'adjp_attributive' },
		},
		'remove': 'Adjective',
		'comment': 'John knew about the secret(N/Adj).',
	},
	{
		'name': 'If Noun-Adjective followed by Verb, remove Adjective',
		'category': 'Noun|Adjective',
		'context': {
			'followedby': { 'category': 'Verb' },
		},
		'remove': 'Adjective',
		'comment': 'Daniel 3:4 The one official(N/Adj) shouted ...',
	},
	{
		'name': 'If Noun-Adjective preceded and followed by "as", remove Noun',
		'category': 'Noun|Adjective',
		'context': {
			'precededby': { 'stem': 'as' },
			'followedby': { 'stem': 'as' },
		},
		'remove': 'Noun',
		'comment': '...as good as...',
	},
	{
		'name': 'If Noun-Adjective preceded by \'be\' or \'feel\', remove Noun',
		'category': 'Noun|Adjective',
		'context': {
			'precededby': { 'category': 'Verb', 'stem': 'be|feel', 'skip': ['vp_modifiers', 'adjp_modifiers_predicative'] },
		},
		'remove': 'Noun',
		'comment': "Infected Eye 1:1 Melissa's eye is sore(N/Adj).  Infected Eye 1:15 Janet's eyes were still sore(N/Adj).",
	},
	{
		'name': 'If Noun-Adjective "silver" or "gold" is preceded by \'have\' and not followed by Noun, remove Adjective',
		'category': 'Noun|Adjective',
		'trigger': { 'stem': 'silver|gold' },
		'context': {
			'precededby': { 'stem': 'have', 'skip': 'adjp_attributive' },
			'notfollowedby': { 'category': 'Noun', 'skip': 'adjp_attributive' },
		},
		'remove': 'Adjective',
		'comment': 'Acts 3:6 Peter did not have silver(N/Adj).',
	},
	{
		'name': 'If Noun-Adjective "silver" or "gold" is preceded by \'of\' and not followed by Noun, remove Adjective',
		'category': 'Noun|Adjective',
		'trigger': { 'stem': 'silver|gold' },
		'context': {
			'precededby': { 'token': 'of' },
			'notfollowedby': { 'category': 'Noun', 'skip': 'adjp_attributive' },
		},
		'remove': 'Adjective',
		'comment': 'Acts 19:24 Demetrius made shrines of silver(N/Adj).',
	},
	{
		'name': 'If Noun-Adverb preceded by a determiner or possessive, remove Adverb',
		'category': 'Noun|Adverb',
		'context': {
			'precededby': {
				'tag': ['determiner', { 'relation': 'genitive_saxon' }],
				'skip': { 'category': 'Adjective' },
			},
		},
		'remove': 'Adverb',
		'comment': "eg 'John argued with Mary about the well.'",
	},
	{
		'name': 'If Verb-Adjective preceded by an article or possessive, remove Verb',
		'category': 'Verb|Adjective',
		'context': {
			'precededby': {
				'tag': ['determiner', { 'relation': 'genitive_saxon' }],
				'skip': { 'category': 'Adjective' },
			},
		},
		'remove': 'Verb',
		'comment': 'The man held the stick in the (man\'s) left(V/Adj) hand',
	},
	{
		'name': 'If Verb-Adjective followed by an article/demonstrative, remove Adjective',
		'category': 'Verb|Adjective',
		'context': {
			'followedby': { 'tag': 'determiner', 'skip': 'vp_modifiers' },
		},
		'remove': 'Adjective',
		'comment': 'Some people have left(V/Adj) the faith.',
	},
	{
		'name': 'If Verb-Adjective preceded by an aspectual auxiliary, remove Adjective',
		'category': 'Verb|Adjective',
		'context': {
			'precededby': { 'stem': 'start|begin|stop|continue|finish', 'skip': { 'token': 'to' } },
		},
		'remove': 'Adjective',
		'comment': 'Some people have stopped following(V/Adj) Christ Jesus.',
	},
	{
		'name': 'If Verb-Adjective preceded by a degree indicator, remove Verb',
		'category': 'Verb|Adjective',
		'context': {
			'precededby': { 'tag': 'degree' },
		},
		'remove': 'Verb',
		'comment': 'Daniel 3:24  Nebuchadnezzar was very surprised(V/Adj).',
	},
	{
		'name': 'If Verb-Adjective "long" preceded by a unit of length, remove Verb',
		'category': 'Verb|Adjective',
		'trigger': { 'token': 'long' },
		'context': { 'precededby': { 'stem': 'meter|kilometer|cubit' } },
		'remove': 'Verb',
		'comment': 'The boat was 200 meters long(V/Adj/Adv).',
	},
	{
		'name': 'If Verb-Adjective preceded by a Noun, remove Adjective',
		'category': 'Verb|Adjective',
		'context': { 'precededby': { 'category': 'Noun' } },
		'remove': 'Adjective',
		'comment': 'The man left the house.',
	},
	{
		'name': "'pleased/satisfied' followed by 'with' is the Adjective",
		'category': 'Verb|Adjective',
		'trigger': { 'token': 'pleased|satisfied' },
		'context': { 'followedby': { 'token': 'with' } },
		'remove': 'Verb',
		'comment': 'Luke 3:22 I am pleased(V/Adj) with you. Proverbs 30:16 ..never satisfied(V/Adj) with water.',
	},
	{
		'name': 'If amazed/surprised NOT followed by any Noun, remove the Verb',
		'category': 'Verb|Adjective',
		'trigger': { 'token': 'amazed|surprised|surprised-B' },
		'context': { 'notfollowedby': { 'category': 'Noun', 'skip': 'all' } },
		'remove': 'Verb',
		'comment': 'The people were amazed(V/Adj). The people were amazed(V/Adj) [Jesus said those things].',
	},
	{
		'name': 'If amazed/surprised IS followed by any Noun, remove the Adjective',
		'category': 'Verb|Adjective',
		'trigger': { 'token': 'amazed|surprised' },
		'context': { 'followedby': { 'category': 'Noun', 'skip': 'all' } },
		'remove': 'Adjective',
		'comment': 'The people were amazed(V/Adj) by Jesus\' words.',
	},
	{
		'name': 'If Adjective-Adposition followed by a determiner, delete the Adjective',
		'category': 'Adjective|Adposition',
		'context': {
			'followedby': { 'tag': 'determiner' },
		},
		'remove': 'Adjective',
		'comment': 'Daniel 1:4 Asphenaz taught them about(Adj/Adp) the ...',
	},
	{
		'name': 'If Adjective-Adposition "about" followed by an Adjective, delete the Adposition',
		'category': 'Adjective|Adposition',
		'trigger': { 'stem': 'about' },
		'context': {
			'followedby': { 'category': 'Adjective' },
			'notfollowedby': { 'stem': 'all|many|each' },
		},
		'remove': 'Adposition',
		'comment': "Daniel 2:1 'for about(Adj/Adp) two years.'  This rule applies specifically to the word 'about' because in general, both Adjectives and Adpositions can precede Adjectives.  Exclude the word 'all' as in Ruth 3:16 'Ruth told Naomi about(Adj/Adp) all(Adj) the things that Boaz did.' Exclude 'many' as in Kande's Story 5:9 'They talked about many things.' This rule really should specify that when 'about' is followed by a numeric Adjective, delete the Adposition.",
	},
	{
		'name': 'If Adjective-Adposition "about" NOT followed by an Adjective, delete the Adjective',
		'category': 'Adjective|Adposition',
		'trigger': { 'stem': 'about' },
		'context': {
			'notfollowedby': { 'category': 'Adjective' },
		},
		'remove': 'Adjective',
		'comment': 'John knew the thing [that John talked about].',
	},
	{
		'name': 'If Adjective-Adposition followed by a Noun, delete the Adjective',
		'category': 'Adjective|Adposition',
		'trigger': { 'stem': 'about' },
		'context': {
			'followedby': { 'category': 'Noun' },
		},
		'remove': 'Adjective',
		'comment': "Daniel 2:1 'Nebuchadnezzar worried about(Adj/Adp) this dream.'  The Adjective 'about' means 'approximately' which can't be followed by a Noun.",
	},
	{
		'name': 'If Adjective-Adverb followed by Noun, remove the Adverb',
		'category': 'Adverb|Adjective',
		'context': {
			'followedby': { 'category': 'Noun' },
		},
		'remove': 'Adverb',
		'comment': 'Dan. 1:12 Please give only(Adj/Adv) vegetables ...',
	},
	{
		'name': 'If Adverb-Adjective followed by Verb, remove Adjective',
		'category': 'Adverb|Adjective',
		'context': {
			'followedby': { 'category': 'Verb' },
		},
		'remove': 'Adjective',
		'comment': 'Infected Eye 1:5  You must first(Adj/Adv) wash ...',
	},
	{
		'name': 'If Adverb-Adjective "long" preceded by the verb be, remove Adverb',
		'category': 'Adverb|Adjective',
		'trigger': { 'token': 'long' },
		'context': { 'precededby': { 'category': 'Verb', 'stem': 'be', 'skip': 'all' } },
		'remove': 'Adverb',
		'comment': 'The boat was 200 meters long(V/Adj/Adv).',
	},
	{
		'name': 'If Adverb-Adposition followed by a Noun, delete the Adverb',
		'category': 'Adverb|Adposition',
		'context': {
			'followedby': { 'category': 'Noun', 'skip': 'np_modifiers' },
		},
		'remove': 'Adverb',
		'comment': 'Daniel 1:1 when(Adv/Adp) Jehoiakim ... 3:5 when(Adv/Adp) the people hear ...',
	},
	{
		'name': 'If Adverb-Adposition followed by a Verb, delete the Adposition',
		'category': 'Adverb|Adposition',
		'context': {
			'followedby': { 'category': 'Verb', 'skip': 'vp_modifiers' },
		},
		'remove': 'Adposition',
		'comment': 'People later(Adv/Adp) called Zion the city of David.',
	},
	{
		'name': "If 'close' is followed by 'to', remove the Verb",
		'category': 'Verb|Adposition',
		'trigger': { 'token': 'close to' },
		'remove': 'Verb',
		'comment': 'e.g. Peter sat close(Adp/Adj/Verb) to the fire. A lookup rule combined "close" and "to"',
	},
	{
		'name': 'If Verb-Adposition precededby by a modal or \'not\', delete the Adposition',
		'category': 'Verb|Adposition',
		'context': {
			'precededby': { 'tag': 'modal|verb_polarity', 'skip': 'vp_modifiers' },
		},
		'remove': 'Adposition',
		'comment': 'John should like(V/Adp) that book.',
	},
	{
		'name': 'If Verb-Adposition at the beginning of a clause, delete the Verb',
		'category': 'Verb|Adposition',
		'context': {
			'precededby': { 'token': '[', 'skip': { 'category': 'Conjunction' } },
		},
		'remove': 'Verb',
		'comment': 'Daniel 2:40  The fourth kingom will be strong [like(V/Adp) iron is strong].',
	},
	{
		'name': 'If Noun-Adposition "On" is followed by a Noun, remove Noun',
		'category': 'Noun|Adposition',
		'trigger': { 'token': 'On' },
		'context': {
			'followedby': { 'category': 'Noun', 'skip': 'np_modifiers' },
		},
		'remove': 'Noun',
		'comment': 'eg. On that day...',
	},
	{
		'name': 'If Noun-Adposition "On" is followed by anything else, remove Adposition',
		'category': 'Noun|Adposition',
		'trigger': { 'token': 'On' },
		'remove': 'Adposition',
		'comment': 'eg. On saw a lion.',
	},
]

const builtin_part_of_speech_rules: BuiltInRule[] = [
	{
		name: "Words with possessive 's must be a noun",
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'relation': 'genitive_saxon' } }),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token }) => keep_parts_of_speech(new Set(['Noun']))(trigger_token)),
		},
	},
	{
		name: 'Words with a pronoun must be a noun.',
		comment: '',
		rule: {
			trigger: token => token.pronoun !== null,
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token }) => keep_parts_of_speech(new Set(['Noun']))(trigger_token)),
		},
	},
	{
		name: 'Filter lookup results for pairings based on part of speech',
		comment: '',
		rule: {
			trigger: token => !!(token.lookup_results.length && token.pairing?.lookup_results.length),
			context: create_context_filter({}),
			action: message_set_action(({ trigger_token: token }) => {
				const left = token
				const right = token.pairing!

				const left_categories = new Set(left.lookup_results.map(result => result.part_of_speech))
				const right_categories = new Set(right.lookup_results.map(result => result.part_of_speech))
				const overlapping_categories = new Set([...left_categories].filter(x => right_categories.has(x)))

				if (overlapping_categories.size > 0) {
					const category_filter = keep_parts_of_speech(overlapping_categories)
					category_filter(left)
					category_filter(right)
				} else {
					return { error: ERRORS.PAIRING_DIFFERENT_PARTS_OF_SPEECH }
				}
			}),
		},
	},
	{
		name: 'Select part-of-speech based on a note',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD,
			context: create_context_filter({ 'followedby': { 'token': '_noun|_verb|_adj|_adv|_adp|_conj|_part|_particle' } }),
			action: simple_rule_action(({ trigger_token, tokens, context_indexes }) => {
				const part_of_speech_note = tokens[context_indexes[0]].token
				const part_of_speech = new Map<string, PartOfSpeech>([
					['_noun', 'Noun'],
					['_verb', 'Verb'],
					['_adj', 'Adjective'],
					['_adv', 'Adverb'],
					['_adp', 'Adposition'],
					['_conj', 'Conjunction'],
					['_part', 'Particle'],
					['_particle', 'Particle'],
				]).get(part_of_speech_note)

				if (!part_of_speech) {
					return
				}

				keep_parts_of_speech(new Set([part_of_speech]))(trigger_token)

				// if no results remain, add a dummy one so the word acts like that part-of-speech
				if (trigger_token.lookup_results.length === 0) {
					trigger_token.lookup_results.push(create_lookup_result({ stem: trigger_token.token, part_of_speech }))
				}
			}),
		},
	},
	{
		name: 'Disambiguate part-of-speech based on the selected sense',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && token.specified_sense.length > 0,
			context: create_context_filter({}),
			action: message_set_action(({ trigger_token: token }) => {
				if (is_one_part_of_speech(token)) {
					return {}
				}

				// get all results that match the specified sense
				const parts_of_speech_for_sense = new Set(token.lookup_results
					.filter(result => result.sense === token.specified_sense)
					.map(result => result.part_of_speech))

				if (parts_of_speech_for_sense.size > 0) {
					keep_parts_of_speech(parts_of_speech_for_sense)(token)
				} else {
					return { warning: `No sense '${token.specified_sense}' was found for this word in any part-of-speech.` }
				}
			}),
		},
	},
	{
		name: 'Disambiguate "is Xing"',
		comment: 'When a verb like "saying" or "teaching" is preceded by "be", another rule wrongly selects the Noun. In these cases, a Noun like this would never immediately follow "be", so we can select the Verb instead.',
		rule: {
			trigger: token => has_part_of_speech({ token, part_of_speech: 'Verb' }) && has_part_of_speech({ token, part_of_speech: 'Noun' }),
			context: create_context_filter({ 'precededby': { 'stem': 'be' } }),
			action: simple_rule_action(({ trigger_token }) => {
				if (trigger_token.lookup_results
					.filter(result => result.part_of_speech === 'Verb')
					.every(result => result.form === 'participle')
				) {
					remove_part_of_speech('Noun')(trigger_token)
				}
			}),
		},
	},
	{
		name: 'If an ambiguous word could be a Verb, and there are no other Verbs in the clause, select the Verb',
		comment: 'this is an implicit rule in the Analyzer',
		rule: {
			trigger: token => has_part_of_speech({ token, part_of_speech: 'Verb' }) && !is_one_part_of_speech(token),
			context: create_context_filter({}),
			action: simple_rule_action(({ tokens, trigger_token, trigger_index }) => {
				// Can't use the context filter, because there may be another ambiguous word somewhere.
				// The context filter only matches words whose part of speech has been fully determined.
				// But we want to prevent this rule from applying if there is ANY possibility of another Verb.
				if (!tokens.some((token, index) => index !== trigger_index && has_part_of_speech({ token, part_of_speech: 'Verb' }))) {
					keep_parts_of_speech(new Set(['Verb']))(trigger_token)
				}
			}),
		},
	},
]

export function parse_part_of_speech_rule({ rule_json, index }: {
	rule_json: PartOfSpeechRuleJson
	index: number
}): TokenRule {
	const category = category_filter(rule_json['category'])
	const trigger = create_token_filter(rule_json['trigger'] ?? 'all')
	const context = create_context_filter(rule_json['context'])
	const action = create_remove_action(rule_json['remove'])

	return {
		id: `part_of_speech:${index}`,
		name: rule_json['name'] ?? '',
		trigger: token => category(token) && trigger(token),
		context,
		action,
	}

	function category_filter(categories_json: string): TokenFilter {
		const categories = categories_json.split('|') as PartOfSpeech[]
		return token => categories.every(category => token.lookup_results.some(LOOKUP_FILTERS.IS_PART_OF_SPEECH(category)))
	}

	function create_remove_action(remove_json: string): RuleAction {
		const remove_action = remove_part_of_speech(remove_json)

		return simple_rule_action(({ trigger_token }) => {
			remove_action(trigger_token)

			if (trigger_token.pairing) {
				remove_action(trigger_token.pairing)
			}
		})
	}
}

export const PART_OF_SPEECH_RULES = builtin_part_of_speech_rules.map(from_built_in_rule('part_of_speech'))
	.concat(part_of_speech_rules_json.map((rule_json, index) => parse_part_of_speech_rule({ rule_json, index })))

function has_part_of_speech({ token, part_of_speech }: { token: Token; part_of_speech: PartOfSpeech }): boolean {
	return token.lookup_results.some(LOOKUP_FILTERS.IS_PART_OF_SPEECH(part_of_speech))
}

function keep_parts_of_speech(parts_of_speech: Set<string>): (token: Token) => void {
	return token => token.lookup_results = token.lookup_results.filter(result => parts_of_speech.has(result.part_of_speech))
}

function remove_part_of_speech(part_of_speech: string): (token: Token) => void {
	return token => token.lookup_results = token.lookup_results.filter(result => result.part_of_speech !== part_of_speech)
}
