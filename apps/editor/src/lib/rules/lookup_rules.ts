import { create_context_filter, create_token_filter } from '#lib/rules/rules_parser.js'
import { TOKEN_TYPE } from '../token'
import type { LookupRuleJson, RuleTriggerContext, TokenRule } from '#lib/rules/types.js'

/**
 * These words/phrases (and some others) are accepted by the Analyzer as alternates for
 * certain words in the Ontology.
 */
const lookup_rules_json: LookupRuleJson[] = [
	{
		'name': 'in-order-to',
		'trigger': { 'token': 'in' },
		'context': { 'followedby': [{ 'token': 'order' }, { 'token': 'to' }] },
		'lookup': 'in-order-to',
		'combine': 2,
	},
	{
		'name': 'in-front-of',
		'trigger': { 'token': 'in' },
		'context': { 'followedby': [{ 'token': 'front' }, { 'token': 'of' }] },
		'lookup': 'in-front-of',
		'combine': 2,
	},
	{
		'name': 'so-that becomes so for lookup purposes',
		'trigger': { 'token': 'so-that' },
		'lookup': 'so',
	},
	{
		'name': 'just-like',
		'trigger': { 'token': 'just' },
		'context': { 'followedby': { 'token': 'like' } },
		'lookup': 'just-like',
		'combine': 1,
	},
	{
		'name': 'like -> just-like (the adposition)',
		'trigger': { 'token': 'like' },
		'context': { 'precededby': { 'token': '[', 'skip': { 'category': 'Conjunction' } } },
		'lookup': 'just-like',
		'comment': 'this is needed so the adposition is found as well, which is handled by words like be/seem/sound/etc',
	},
	{
		'name': 'even-if',
		'trigger': { 'token': 'Even|even' },
		'context': { 'followedby': { 'token': 'if' } },
		'lookup': 'even-if',
		'combine': 1,
	},
	{
		'name': 'much becomes much-many if followed by a Noun',
		'trigger': { 'token': 'Much|much' },
		'context': { 'followedby': { 'category': 'Noun' } },
		'lookup': 'much-many',
		'comment': 'something like "There is much water"',
	},
	{
		'name': 'many becomes much-many',
		'trigger': { 'token': 'Many|many' },
		'lookup': 'much-many',
	},
	{
		'name': 'every becomes each',
		'trigger': { 'token': 'Every|every' },
		'lookup': 'each',
	},
	{
		'name': 'half becomes .5',
		'trigger': { 'token': 'half' },
		'lookup': '.5',
	},
	{
		'name': 'one tenth of',
		'trigger': { 'token': 'One|one' },
		'context': { 'followedby': [{ 'token': 'tenth' }, { 'token': 'of' }] },
		'lookup': '.1',
		'combine': 2,
	},
	{
		'name': 'close to becomes close',
		'trigger': { 'token': 'close' },
		'context': { 'followedby': { 'token': 'to' } },
		'lookup': 'close',
		'combine': 1,
	},
	{
		'name': 'give birth',
		'trigger': { 'stem': 'give' },
		'context': { 'followedby': { 'token': 'birth' } },
		'lookup': 'birth',
		'combine': 1,
	},
	{
		'name': 'take care',
		'trigger': { 'stem': 'take' },
		'context': { 'followedby': { 'token': 'care' } },
		'lookup': 'care',
		'combine': 1,
	},
	{
		'name': 'look for -> search',
		'trigger': { 'stem': 'look' },
		'context': { 'followedby': { 'token': 'for' } },
		'lookup': 'search',
	},
	{
		'name': 'look like -> appear-B',
		'trigger': { 'stem': 'look' },
		'context': { 'followedby': { 'token': 'like' } },
		'lookup': 'appear',
	},
	{
		'name': 'what becomes thing-A in a question',
		'trigger': { 'token': 'What|what' },
		'context': { 'followedby': { 'token': '?', 'skip': 'all' } },
		'lookup': 'thing',
	},
	{
		'name': 'who becomes person-A in a question',
		'trigger': { 'token': 'Who|who' },
		'context': { 'followedby': { 'token': '?', 'skip': 'all' } },
		'lookup': 'person',
	},
]

export function parse_lookup_rule({ rule_json, index }: {
	rule_json: LookupRuleJson
	index: number
}): TokenRule {
	const trigger = create_token_filter(rule_json['trigger'])
	const context = create_context_filter(rule_json['context'])

	const lookup_term = rule_json['lookup']
	const combine = rule_json['combine'] ?? 0

	return {
		id: `lookup:${index}`,
		name: rule_json['name'] ?? '',
		trigger,
		context,
		action: lookup_rule_action,
	}

	function lookup_rule_action({ tokens, trigger_index, trigger_token, context_indexes }: RuleTriggerContext): number {
		const lookup_terms = lookup_term.split('|')
		
		tokens[trigger_index] = {
			...trigger_token,
			type: TOKEN_TYPE.LOOKUP_WORD,
			lookup_terms,
			lookup_results: trigger_token.lookup_results.filter(result => lookup_terms.includes(result.stem)),
		}

		if (context_indexes.length === 0) {
			return trigger_index + 1
		}

		if (combine === 0 || context_indexes[combine-1] !== trigger_index + combine) {
			return trigger_index + 1
		}
		
		// combine context tokens into one
		const tokens_to_combine = tokens.splice(trigger_index, combine + 1)
		const new_token_value = tokens_to_combine.map(({ token }) => token).join(' ')
		tokens.splice(trigger_index, 0, { ...tokens_to_combine[0], token: new_token_value })
		return trigger_index + combine + 1
	}
}

export const LOOKUP_RULES = lookup_rules_json.map((rule_json, index) => parse_lookup_rule({ rule_json, index }))
