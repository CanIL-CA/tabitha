import { TOKEN_TYPE } from '#lib/token.js'
import { create_token_filter } from '#lib/rules/rules_parser.js'
import type { CoordinatePosition } from '#lib/rules/coordination.js'
import type { Token } from '#lib/types.js'
import type { RuleTriggerContext, TokenFilter } from '#lib/rules/types.js'

const is_head_noun = create_token_filter({ 'tag': { 'syntax': 'head_np' } })
const is_patient_clause = create_token_filter({
	'type': TOKEN_TYPE.CLAUSE,
	'tag': { 'clause_type': 'patient_clause_different_participant|patient_clause_same_participant|patient_clause_simultaneous' },
})
const COORDINATED_ARGUMENT_FILTERS: TokenFilter[] = [is_head_noun, is_patient_clause]

const SEQUENCE_END_BY_DIRECTION: Record<-1 | 1, CoordinatePosition> = {
	[-1]: 'first',
	[1]: 'last',
}

type ConjunctSearch = {
	tokens: Token[]
	index: number
	direction: -1 | 1
	is_conjunct: TokenFilter
}

/**
 * A rule only matches one noun or clause, but everything coordinated with it is an argument with the same role,
 * eg both 'John' and 'Mary' in 'John and Mary went', or both clauses in 'John said [that Mary left] [and Peter stayed]'.
 * The transform rules have already tagged each conjunct's position in its sequence.
 */
export function with_coordinated_arguments(argument_context: RuleTriggerContext): RuleTriggerContext[] {
	const { tokens, trigger_index, trigger_token } = argument_context
	const is_conjunct = COORDINATED_ARGUMENT_FILTERS.find(filter => filter(trigger_token))
	if (!is_conjunct || !trigger_token.tag['coordinate']) return [argument_context]

	const preceding_indexes = find_conjunct_indexes({ tokens, index: trigger_index, direction: -1, is_conjunct }).reverse()
	const following_indexes = find_conjunct_indexes({ tokens, index: trigger_index, direction: 1, is_conjunct })

	return [...preceding_indexes, trigger_index, ...following_indexes]
		.map(index => ({ ...argument_context, trigger_index: index, trigger_token: tokens[index] }))
}

function find_conjunct_indexes(search: ConjunctSearch): number[] {
	const { tokens, index, direction } = search
	if (tokens[index].tag['coordinate'] === SEQUENCE_END_BY_DIRECTION[direction]) return []

	const adjacent_index = find_adjacent_conjunct_index(search)
	if (adjacent_index === -1) return []

	return [adjacent_index, ...find_conjunct_indexes({ ...search, index: adjacent_index })]
}

function find_adjacent_conjunct_index({ tokens, index, direction, is_conjunct }: ConjunctSearch): number {
	for (let i = index + direction; tokens[i]; i += direction) {
		if (is_conjunct(tokens[i]) && tokens[i].tag['coordinate']) return i
	}
	return -1
}
