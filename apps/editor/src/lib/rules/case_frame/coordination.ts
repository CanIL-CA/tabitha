import { TOKEN_TYPE } from '#lib/token.js'
import { create_context_filter, create_skip_filter, create_token_filter } from '#lib/rules/rules_parser.js'
import type { CheckerTokenType } from '@tabitha/types'
import type { Token } from '#lib/types.js'
import type { RuleTriggerContext, TokenFilter } from '#lib/rules/types.js'

const is_head_noun = create_token_filter({ 'tag': { 'syntax': 'head_np' } })
const is_noun_coordinator = create_token_filter({ 'tag': { 'syntax': 'coord_noun|comma' } })
const is_np_token = create_skip_filter('np')
const is_comma = create_token_filter({ 'tag': { 'syntax': 'comma' } })
const is_patient_clause = create_token_filter({
	'type': TOKEN_TYPE.CLAUSE,
	'tag': { 'clause_type': 'patient_clause_different_participant|patient_clause_same_participant|patient_clause_simultaneous' },
})
const starts_with_clause_coordinator = create_context_filter({
	'subtokens': { 'stem': 'and|or', 'skip': [{ 'token': '[' }, { 'token': '"' }] },
})
const ALWAYS_SKIPPED_TOKEN_TYPES: CheckerTokenType[] = [TOKEN_TYPE.NOTE, TOKEN_TYPE.ADDED]

type ConjunctSearch = {
	tokens: Token[]
	index: number
	direction: -1 | 1
}

type AdjacentConjunctFinder = (search: ConjunctSearch) => number

const CONJUNCT_FINDERS: { is_conjunct: TokenFilter; find_adjacent: AdjacentConjunctFinder }[] = [
	{ is_conjunct: is_head_noun, find_adjacent: find_adjacent_noun },
	{ is_conjunct: is_patient_clause, find_adjacent: find_adjacent_patient_clause },
]

/**
 * A rule only matches one noun or clause, but everything coordinated with it is an argument with the same role,
 * eg both 'John' and 'Mary' in 'John and Mary went', or both clauses in 'John said [that Mary left] [and Peter stayed]'.
 */
export function with_coordinated_arguments(argument_context: RuleTriggerContext): RuleTriggerContext[] {
	const { tokens, trigger_index, trigger_token } = argument_context
	const conjunct_finder = CONJUNCT_FINDERS.find(({ is_conjunct }) => is_conjunct(trigger_token))
	if (!conjunct_finder) return [argument_context]

	const { find_adjacent } = conjunct_finder
	const preceding_indexes = find_conjunct_indexes({ tokens, index: trigger_index, direction: -1, find_adjacent }).reverse()
	const following_indexes = find_conjunct_indexes({ tokens, index: trigger_index, direction: 1, find_adjacent })

	return [...preceding_indexes, trigger_index, ...following_indexes]
		.map(index => ({ ...argument_context, trigger_index: index, trigger_token: tokens[index] }))
}

function find_conjunct_indexes(search: ConjunctSearch & { find_adjacent: AdjacentConjunctFinder }): number[] {
	const adjacent_index = search.find_adjacent(search)
	if (adjacent_index === -1) return []

	return [adjacent_index, ...find_conjunct_indexes({ ...search, index: adjacent_index })]
}

/**
 * Clauses are coordinated by a comma between them, or by the later clause starting with and/or,
 * eg 'John said [that Mary left], [Peter stayed] [and James slept]'
 */
function find_adjacent_patient_clause({ tokens, index, direction }: ConjunctSearch): number {
	const adjacent_index = skip_tokens({ tokens, index: index + direction, direction, should_skip: is_between_clauses })
	const adjacent_clause = tokens[adjacent_index]
	if (!adjacent_clause || !is_patient_clause(adjacent_clause)) return -1
	if (!shares_clause_type({ clause: tokens[index], other_clause: adjacent_clause })) return -1

	const later_index = Math.max(index, adjacent_index)
	const is_separated_by_comma = tokens.slice(Math.min(index, adjacent_index) + 1, later_index).some(is_comma)
	const is_coordinated = is_separated_by_comma || starts_with_clause_coordinator(tokens, later_index).success
	return is_coordinated ? adjacent_index : -1
}

function is_between_clauses(token: Token): boolean {
	return ALWAYS_SKIPPED_TOKEN_TYPES.includes(token.type) || is_comma(token)
}

function shares_clause_type({ clause, other_clause }: { clause: Token; other_clause: Token }): boolean {
	const clause_types = clause.tag['clause_type']?.split('|') ?? []
	const other_clause_types = other_clause.tag['clause_type']?.split('|') ?? []
	return clause_types.some(clause_type => other_clause_types.includes(clause_type))
}

/**
 * eg in 'the king of Egypt, John, and his servants', the conjuncts adjacent to 'John' are 'king' and 'servants'
 */
function find_adjacent_noun({ tokens, index, direction }: ConjunctSearch): number {
	const coordinator_index = skip_tokens({ tokens, index: index + direction, direction, should_skip: is_inside_conjunct })
	if (!tokens[coordinator_index] || !is_noun_coordinator(tokens[coordinator_index])) return -1

	const after_coordinators_index = skip_tokens({ tokens, index: coordinator_index, direction, should_skip: is_noun_coordinator })
	const head_index = skip_tokens({ tokens, index: after_coordinators_index, direction, should_skip: is_inside_conjunct })
	return tokens[head_index] && is_head_noun(tokens[head_index]) ? head_index : -1
}

function skip_tokens({ tokens, index, direction, should_skip }: ConjunctSearch & { should_skip: (token: Token) => boolean }): number {
	let i = index
	while (tokens[i] && should_skip(tokens[i])) {
		i += direction
	}
	return i
}

function is_inside_conjunct(token: Token): boolean {
	return ALWAYS_SKIPPED_TOKEN_TYPES.includes(token.type)
		|| is_np_token(token) && !is_noun_coordinator(token) && !is_head_noun(token)
}
