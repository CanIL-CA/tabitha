import { add_tag_to_token, create_gap_token, TOKEN_TYPE } from '#lib/token.js'
import { create_context_filter, create_skip_filter, create_token_filter, simple_rule_action } from '../rules_parser'
import { create_gap_option, use_same_subject_gap, type GapLabel } from './gap_option'
import type { Token } from '#lib/types.js'
import type { RuleTriggerContext, TokenFilter, TokenRuleCore } from '#lib/rules/types.js'

export function fill_same_subject_gap({ tokens, rule_id }: { tokens: Token[]; rule_id: string }) {
	// place the gap token right after any conjunction or adposition
	const skip_filter = create_skip_filter(['clause_start', { 'category': 'Adposition' }, { 'tag': { 'syntax': 'gerundifier' } }])
	const gap_index = skip_following({ tokens, start_index: 0, skip_filter })
	insert_gap_noun_token({ gap_label: 'SAME_SUB', tokens, gap_indexes: [gap_index], rule_id })
}

/**
 * - insert: the gap is inserted at the location
 * - same_subject: the same-subject gap at the location is the relative gap
 * - subject_or_object: the gap is either the same-subject gap of the clause, or in the object position at the location.
 *     This gets resolved once the case frames can be checked.
 */
type GapKind = 'insert' | 'same_subject' | 'subject_or_object'

type GapLocation = {
	kind: GapKind
	// the indexes of any nested clauses, then the index within the innermost clause
	path: number[]
}

type GapFillOptions = {
	gap_clause: Token
	clause: Token
	index: number
	gap_label: GapLabel
	rule_id: string
}

const GAP_FILLERS: Record<GapKind, (options: GapFillOptions) => void> = {
	insert: ({ clause, index, gap_label, rule_id }) => {
		insert_gap_noun_token({ gap_label, tokens: clause.sub_tokens, gap_indexes: [index], rule_id })
	},
	same_subject: ({ clause, gap_label, rule_id }) => {
		const { sub_tokens, tag } = use_same_subject_gap({ clause, gap_label, rule_id })
		clause.sub_tokens = sub_tokens
		add_tag_to_token({ token: clause, tag: { 'clause_type': tag['clause_type'] }, rule_id })
	},
	subject_or_object: ({ gap_clause, clause, index, gap_label, rule_id }) => {
		clause.sub_tokens.splice(index, 0, create_gap_option({ gap_label, rule_id }))
		add_tag_to_token({ token: gap_clause, tag: { 'gap_reading': 'subject_or_object' }, rule_id })
	},
}

export function fill_relative_clause_gap({ clause, rule_id }: { clause: Token; rule_id: string }) {
	fill_clause_gap({ gap_clause: clause, gap_label: 'REL', rule_id })
}

function fill_clause_gap({ gap_clause, gap_label, rule_id }: { gap_clause: Token; gap_label: GapLabel; rule_id: string }) {
	const { kind, path } = find_clause_gap(gap_clause.sub_tokens)
	const innermost_clause = path.slice(0, -1).reduce((parent, index) => parent.sub_tokens[index], gap_clause)
	GAP_FILLERS[kind]({ gap_clause, clause: innermost_clause, index: path.at(-1)!, gap_label, rule_id })
}

export function fill_interrogative_gap({ clause, verb_index, rule_id }: { clause: Token; verb_index: number; rule_id: string }) {
	const tokens = clause.sub_tokens
	const head_np = { 'tag': { 'syntax': 'head_np' }, 'skip': ['np_modifiers', 'vp_modifiers'] }

	const gap_rules: TokenRuleCore[] = [
		{
			trigger: create_token_filter({ 'stem': 'be' }),
			context: create_context_filter({
				'precededby': head_np,
				'followedby': head_np,
			}),
			action: simple_rule_action(({ tokens, rule_id }) => {
				const gap_index = find_clause_end_for_gap(tokens)
				insert_gap_noun_token({ gap_label: 'INTV_N', tokens, gap_indexes: [gap_index], rule_id })
			}),
		},
		{
			trigger: () => true,
			context: create_context_filter({
				'precededby': [head_np, { 'tag': 'auxiliary', 'skip': 'np_modifiers' }, head_np],
			}),
			action: simple_rule_action(({ rule_id }) => {
				fill_clause_gap({ gap_clause: clause, gap_label: 'INTV_N', rule_id })
			}),
		},
	]

	const verb_token = tokens[verb_index]
	const gap_rule = gap_rules.find(rule => rule.trigger(verb_token) && rule.context(tokens, verb_index).success)
	if (gap_rule) {
		const verb_trigger_context: RuleTriggerContext = {
			trigger_token: verb_token,
			trigger_index: verb_index,
			tokens,
			context_indexes: [],
			subtoken_indexes: [],
			rule_id,
		}
		gap_rule.action(verb_trigger_context)
	}
}

export function handle_be_interrogative({ tokens, be_index, rule_id }: { tokens: Token[]; be_index: number; rule_id: string }) {
	// eg. 'Who(A) is happy?' 'Who(A) is at the store(S)?' 'Who(A) is like our God(S)?' (don't move)
	// eg. 'Who(?) is that man(A) GAP(S)?' 'Which book(?) is John's book(A) GAP(S)?' 'What(?) is that book(A) about GAP(S)?'
	// eg. 'Is John(A) that man's father(S)?' 'Is that book(A) John's book(S)?'
	// eg. 'Is John(A) happy?' 'Is John(A) at the store(S)?' 'Is that book(A) about John(S)?'
	// move the verb and leave behind a gap token ONLY if 'be' is followed directly by a head noun
	const context_filter = create_context_filter({ 'followedby': { 'tag': { 'syntax': 'head_np' }, 'skip': ['np_modifiers', 'vp_modifiers'] } })
	const context_result = context_filter(tokens, be_index)
	if (!context_result.success) {
		return
	}

	// Insert a 'gap' verb after the noun phrase that directly follows it
	// This solution isn't perfect because there may be a norman genitive ('of X').
	// 		We can't check for that because there's no way at this point to identify where that np would end.
	// 		It may be followed directly by another NP ('Is the brother of Paul John?') or an AdjP ('Is the brother of Paul happy?').
	// This solution will work in most cases, and since a genitive is not marked as 'head_np', it shouldn't affect the case frame checking either.
	const head_np_index = context_result.context_indexes[0]
	const np_end_skip_filter = create_skip_filter({ 'tag': { 'clause_type': 'relative_clause' } })
	const vp_gap_index = skip_following({ tokens, start_index: head_np_index, skip_filter: np_end_skip_filter })
	insert_ghosted_gap_token({ gap_label: 'INTV_V', tokens, ghost_index: be_index, gap_index: vp_gap_index, rule_id })
}

function find_clause_end_for_gap(tokens: Token[]): number {
	// starting from the end, find the first index that isn't punctuation
	const IS_PUNCTUATION: TokenFilter = token => token.type === TOKEN_TYPE.PUNCTUATION
	return find_preceding({ tokens, start_index: tokens.length, token_filter: token => !IS_PUNCTUATION(token), skip_filter: IS_PUNCTUATION })[1] + 1
}

const is_patient_clause_with_gap = create_token_filter({ 'tag': { 'clause_type': 'patient_clause_same_participant|patient_clause_different_participant' } })

const insert_at = (path: number[]): GapLocation => ({ kind: 'insert', path })

function find_clause_gap(tokens: Token[]): GapLocation {
	const head_np_filter = create_token_filter({ 'tag': { 'syntax': 'head_np' } })
	const np_vp_filter = create_skip_filter(['np', 'vp_modifiers'])
	const np_filter = create_skip_filter('np')
	
	const verb_index = tokens.findIndex(create_token_filter({ 'category': 'Verb' }))
	if (verb_index === -1) {
		// if no verb, default to the end of the clause
		return insert_at([find_clause_end_for_gap(tokens)])
	}

	// First check if there's a gap in the subject position
	// eg. John saw the person [who {} left].
	const [found_subj, index_subj] = find_preceding({ tokens, start_index: verb_index, token_filter: head_np_filter, skip_filter: np_vp_filter })
	if (!found_subj) {
		return insert_at([index_subj + 1])
	}

	// Next check if there is a dangling adposition at the end of the clause
	// eg. John knows the problem [that Mary told John about {}]. John has the bag [that John puts money into {}].
	const adposition_filter = create_skip_filter([{ 'category': 'Adposition' }, { 'token': 'to|from|by' }])
	const last_adp_index = tokens.findLastIndex(adposition_filter)
	if (last_adp_index !== -1 && last_adp_index > verb_index) {
		const [found_oblique, index_oblique] = find_following({ tokens, start_index: last_adp_index, token_filter: head_np_filter, skip_filter: np_filter })
		if (!found_oblique) {
			return insert_at([index_oblique])
		}
	}

	// Next check if there's a dangling adposition right before another adposition
	// eg. John knows the problem [that John talked about {} to Mary].
	let prev_adp_index = -1
	for (let i = 0; i < tokens.length; i++) {
		if (adposition_filter(tokens[i])) {
			if (prev_adp_index === i-1) {
				return insert_at([prev_adp_index + 1])
			}
			prev_adp_index = i
		}
	}

	// Next check inside a non-quote patient clause
	// eg. John knows the thing [that Peter wants [John to do {}]].
	// eg. John was the person [that Peter wants [{} to do those things]].
	// if there is a non-quote patient clause, the gap is highly likely to be inside it at this point.
	const patient_clause_index = tokens.findIndex(is_patient_clause_with_gap)
	if (patient_clause_index !== -1) {
		const { kind, path } = find_clause_gap(tokens[patient_clause_index].sub_tokens)
		return { kind, path: [patient_clause_index, ...path] }
	}

	const [found_obj, index_obj] = find_following({ tokens, start_index: verb_index, token_filter: head_np_filter, skip_filter: np_vp_filter })

	// Inside a patient clause, the gap may be the clause's own same-subject gap
	// eg. John saw the person [that Peter wanted [{} to do those things]].
	// eg. John saw the person [that Peter wanted [{} to leave {}]]. (either one)
	if (tokens[index_subj].token === 'GAP_SAME_SUB') {
		return { kind: found_obj ? 'same_subject' : 'subject_or_object', path: [found_obj ? index_subj : index_obj] }
	}

	// Next check if there's a gap right after the verb
	// eg. John saw the person [who John told {} about the problem].
	if (!found_obj) {
		return insert_at([index_obj])
	}

	// Default to the end of the clause
	return insert_at([find_clause_end_for_gap(tokens)])
}

function insert_gap_noun_token({ gap_label, tokens, gap_indexes, rule_id }: { gap_label: string; tokens: Token[]; gap_indexes: number[]; rule_id: string }) {
	let gap_index = gap_indexes.splice(0, 1)[0]
	while (gap_indexes.length) {
		tokens = tokens[gap_index].sub_tokens
		gap_index = gap_indexes.splice(0, 1)[0]
	}

	const gap_token = create_gap_token({ rule_id, label: gap_label, tag: { 'syntax': 'head_np' } })
	tokens.splice(gap_index, 0, gap_token)
}

function insert_ghosted_gap_token({ gap_label, tokens, ghost_index, gap_index, rule_id }: { gap_label: string; tokens: Token[]; ghost_index: number; gap_index: number; rule_id: string }) {
	const ghost_token = tokens[ghost_index]
	ghost_token.type = TOKEN_TYPE.NOTE	// temporarily change to NOTE to avoid being processed as a normal token
	add_tag_to_token({ token: ghost_token, tag: { 'gap_index': `${gap_index}` }, rule_id })

	const gap_token = create_gap_token({ rule_id, label: gap_label, tag: { 'ghost_index': `${ghost_index}` } })
	tokens.splice(gap_index, 0, gap_token)

	gap_token.lookup_results = ghost_token.lookup_results
	ghost_token.lookup_results = []
}

export function restore_ghost_tokens({ tokens, ghost_index }: { tokens: Token[]; ghost_index: number }) {
	const ghost_token = tokens[ghost_index]
	const gap_index = parseInt(ghost_token.tag['gap_index'])
	const gap_token = tokens[gap_index]
	ghost_token.lookup_results = gap_token.lookup_results
	gap_token.lookup_results = []
	ghost_token.type = TOKEN_TYPE.LOOKUP_WORD
}

function find_preceding({ tokens, start_index, token_filter, skip_filter = () => false }: { tokens: Token[]; start_index: number; token_filter: TokenFilter; skip_filter?: TokenFilter }): [boolean, number] {
	let index = start_index - 1
	while (index >= 0 && !token_filter(tokens[index]) && should_skip({ token: tokens[index], skip_filter })) {
		index -= 1
	}
	return tokens[index] && token_filter(tokens[index]) ? [true, index] : [false, index]
}

function skip_following({ tokens, start_index, skip_filter }: { tokens: Token[]; start_index: number; skip_filter: TokenFilter }): number {
	let index = start_index + 1
	while (index < tokens.length && should_skip({ token: tokens[index], skip_filter })) {
		index += 1
	}
	return index
}

function find_following({ tokens, start_index, token_filter, skip_filter = () => false }: { tokens: Token[]; start_index: number; token_filter: TokenFilter; skip_filter?: TokenFilter }): [boolean, number] {
	let index = start_index + 1
	while (index < tokens.length && !token_filter(tokens[index]) && should_skip({ token: tokens[index], skip_filter })) {
		index += 1
	}
	return tokens[index] && token_filter(tokens[index]) ? [true, index] : [false, index]
}

function should_skip({ token, skip_filter }: { token: Token; skip_filter: TokenFilter }): boolean {
	return skip_filter(token) || token.type === TOKEN_TYPE.NOTE
}