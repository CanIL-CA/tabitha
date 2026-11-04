import { create_token, token_has_tag, TOKEN_TYPE } from '#lib/token.js'
import { find_enclosing_np_start, get_np_head, get_phrase_span, get_span_contents, is_np_start, type ConstituentSpan } from './phrase_helpers'
import type { Sentence, Token } from '#lib/types.js'

// the tokens inside an NP, without its opening '{NP' and closing '}' phrase tokens
type NpContents = ConstituentSpan

type GapSources = {
	readonly relative_np: NpContents | null
	// coordinated agents are each their own NP
	readonly parent_agent_nps: NpContents[]
	readonly interrogative_np: NpContents | null
}

// GAP_INTV_V tokens have already been replaced by the time the analyzer runs, so they are left alone
const GAP_SOURCE_GETTERS: Record<string, (sources: GapSources) => NpContents[]> = {
	GAP_REL: ({ relative_np }) => relative_np ? [relative_np] : [],
	GAP_SAME_SUB: ({ parent_agent_nps }) => parent_agent_nps,
	GAP_INTV_N: ({ interrogative_np }) => interrogative_np ? [interrogative_np] : [],
}

const NO_GAP_SOURCES: GapSources = {
	relative_np: null,
	parent_agent_nps: [],
	interrogative_np: null,
}

/**
 * Replace each GAP token with a copy of the NP(s) it refers to, except the interrogative NP which is moved. The gap's own '{NP' token is kept,
 * so the gap's role is maintained rather than the role of the NP that was copied.
 * When a gap refers to multiple NPs, each copy gets its own '{NP' based on the gap's.
 * This expects phrasified tokens.
 */
export function replace_gaps(sentences: Sentence[]): Sentence[] {
	return sentences.map(({ clause }) => ({ clause: replace_gaps_in_clause({ clause, sources: NO_GAP_SOURCES }) }))
}

function replace_gaps_in_clause({ clause, sources }: { clause: Token; sources: GapSources }): Token {
	const { remaining_tokens, interrogative_np } = take_interrogative_np(clause.sub_tokens)
	const clause_sources: GapSources = {
		...sources,
		interrogative_np: interrogative_np ?? sources.interrogative_np,
	}
	const tokens = remaining_tokens.flatMap((token, index, original_tokens) => fill_gap({
		token,
		gap_np_start: original_tokens[find_enclosing_np_start({ tokens: original_tokens, index })],
		sources: clause_sources,
	}))
	const agent_nps = find_agent_nps(tokens)

	const sub_tokens = tokens.map((token, index) => {
		if (token.type !== TOKEN_TYPE.CLAUSE) return token

		const sub_clause_sources: GapSources = {
			relative_np: is_relative_clause(token) ? find_modified_np({ tokens, relative_clause_index: index }) : clause_sources.relative_np,
			parent_agent_nps: agent_nps,
			interrogative_np: clause_sources.interrogative_np,
		}
		return replace_gaps_in_clause({ clause: token, sources: sub_clause_sources })
	})

	return { ...clause, sub_tokens }
}

function fill_gap({ token, gap_np_start, sources }: { token: Token; gap_np_start: Token | undefined; sources: GapSources }): Token[] {
	const get_sources = GAP_SOURCE_GETTERS[token.token]
	if (token.type !== TOKEN_TYPE.GAP || !get_sources) return [token]

	const source_nps = get_sources(sources)
	if (!source_nps.length) return [token]

	// the first copy goes inside the gap's own NP, and any others are each wrapped in a copy of it
	const np_separator = gap_np_start ? [create_token({ token: '}', type: TOKEN_TYPE.PHRASE }), gap_np_start] : []
	return source_nps.flatMap((np_contents, index) => [
		...index === 0 ? [] : np_separator.map(clone_token),
		...np_contents.map(clone_token),
	])
}

function find_agent_nps(tokens: Token[]): NpContents[] {
	return tokens.flatMap((token, index) => is_np_start(token) && token_has_tag({ token, tag_to_check: { 'role': 'agent' } })
		? [get_np_contents({ tokens, np_start_index: index })]
		: [])
}

/**
 * The interrogative NP is moved to its gap, so it gets removed from its original position.
 * It's left in place when there's no gap for it, eg. 'Who left?'
 */
function take_interrogative_np(tokens: Token[]): { remaining_tokens: Token[]; interrogative_np: NpContents | null } {
	const np_start_index = find_interrogative_np_start(tokens)
	if (np_start_index === -1 || !has_interrogative_gap(tokens)) {
		return { remaining_tokens: tokens, interrogative_np: null }
	}

	const np_span = get_phrase_span({ tokens, start_index: np_start_index })
	return {
		remaining_tokens: [...tokens.slice(0, np_start_index), ...tokens.slice(np_start_index + np_span.length)],
		interrogative_np: get_span_contents(np_span),
	}
}

function find_interrogative_np_start(tokens: Token[]): number {
	const interrogative_index = tokens.findIndex(token => token_has_tag({ token, tag_to_check: { 'determiner': 'interrogative' } }))
	return interrogative_index === -1 ? -1 : find_enclosing_np_start({ tokens, index: interrogative_index })
}

// a nested clause with its own interrogative NP fills its own gap
function has_interrogative_gap(tokens: Token[]): boolean {
	return tokens.some(token => token.type === TOKEN_TYPE.GAP && token.token === 'GAP_INTV_N'
		|| token.type === TOKEN_TYPE.CLAUSE && find_interrogative_np_start(token.sub_tokens) === -1 && has_interrogative_gap(token.sub_tokens))
}

function find_modified_np({ tokens, relative_clause_index }: { tokens: Token[]; relative_clause_index: number }): Token[] | null {
	const np_start_index = find_enclosing_np_start({ tokens, index: relative_clause_index })
	if (np_start_index === -1) return null

	const np_head = get_np_head({ tokens, np_start_index })
	return np_head ? [np_head] : []
}

function get_np_contents({ tokens, np_start_index }: { tokens: Token[]; np_start_index: number }): NpContents {
	return get_span_contents(get_phrase_span({ tokens, start_index: np_start_index }))
}

function is_relative_clause(token: Token): boolean {
	return token.type === TOKEN_TYPE.CLAUSE && token_has_tag({ token, tag_to_check: { 'clause_type': 'relative_clause' } })
}

function clone_token(token: Token): Token {
	return {
		...token,
		tag: { ...token.tag },
		messages: [...token.messages],
		applied_rules: [...token.applied_rules],
		sub_tokens: token.sub_tokens.map(clone_token),
	}
}
