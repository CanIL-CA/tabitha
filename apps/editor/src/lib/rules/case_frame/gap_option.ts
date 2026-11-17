import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
import { add_tag_to_token, create_gap_token, is_one_part_of_speech, token_has_tag, TOKEN_TYPE } from '#lib/token.js'
import { create_token_filter } from '#lib/rules/rules_parser.js'
import { check_case_frames } from './common'
import { check_passive_verb_case_frames, initialize_word_case_frames, is_passive_verb_context, is_verb } from './word_case_frames'
import type { LookupResult, Tag, Token } from '#lib/types.js'
import type { RuleTriggerContext } from '#lib/rules/types.js'

/**
 * When a relative or interrogative clause's gap could be either the subject or the object of a patient clause with a same-subject gap,
 * eg. 'the person [that Peter wanted [to leave]]', 'the thing [that Peter wanted [to do]]' or 'Who did Peter want [to leave]?',
 * a dormant gap option (eg. GAP_REL_OPTION) is placed in the object position and the clause is tagged 'gap_reading: subject_or_object'.
 * Before the case frames are checked, each reading is tried against the case frames of the words in the patient clause and its parent,
 * and the reading that keeps the most of them valid is kept.
 */

export type GapReading = 'subject' | 'object'

export type GapLabel = 'REL' | 'INTV_N'

export type AmbiguousGap = {
	verb: Token
	reading: GapReading
	other_reading: GapReading
	noun_description: string
}

type ClauseContents = {
	sub_tokens: Token[]
	tag: Tag
}

type AmbiguousClause = {
	// the clause that contains the patient clause, which is the gap's own clause unless the patient clause is nested deeper
	parent: Token
	clause: Token
	gap_label: GapLabel
}

type ReadingOptions = {
	clause: Token
	gap_label: GapLabel
	rule_id: string
}

const SAME_SUBJECT_GAP = 'GAP_SAME_SUB'

const is_head_np = create_token_filter({ 'tag': { 'syntax': 'head_np' } })
const is_interrogative_noun = create_token_filter({ 'tag': { 'noun_tracking': 'interrogative' } })
const is_verb_or_adjective = create_token_filter({ 'category': 'Verb|Adjective' })
const is_case_frame_word = (token: Token): boolean => is_one_part_of_speech(token) && is_verb_or_adjective(token)

const READINGS: Record<GapReading, (options: ReadingOptions) => ClauseContents> = {
	subject: use_same_subject_gap,
	object: ({ clause, gap_label, rule_id }) => ({
		sub_tokens: clause.sub_tokens.map(token => is_gap_option(token) ? create_gap({ gap_label, tag: { 'syntax': 'head_np' }, rule_id }) : token),
		tag: clause.tag,
	}),
}

// the noun that fills the gap, used to break a tie between the readings
const GAP_NOUN_FINDERS: Record<GapLabel, (trigger_context: RuleTriggerContext) => Token | undefined> = {
	// the relative clause directly follows the NP it modifies
	REL: ({ tokens, trigger_index }) => tokens.slice(0, trigger_index).findLast(is_head_np),
	INTV_N: ({ trigger_token }) => trigger_token.sub_tokens.find(is_interrogative_noun),
}

const OTHER_READINGS: Record<GapReading, GapReading> = {
	subject: 'object',
	object: 'subject',
}

const GAP_NOUN_DESCRIPTIONS: Record<string, string> = {
	GAP_REL: 'relativized noun',
	GAP_INTV_N: 'interrogative noun',
}

/**
 * Describes a gap that was tagged ambiguous for the checkers, which flag the verb of its clause.
 * The subject gap comes before the verb and the object gap after it.
 */
export function describe_ambiguous_gap({ tokens, trigger_index }: RuleTriggerContext): AmbiguousGap | null {
	const verb_index = tokens.findIndex(is_verb)
	if (verb_index === -1) return null

	const reading: GapReading = trigger_index < verb_index ? 'subject' : 'object'
	return {
		verb: tokens[verb_index],
		reading,
		other_reading: OTHER_READINGS[reading],
		noun_description: GAP_NOUN_DESCRIPTIONS[tokens[trigger_index].token] ?? 'noun',
	}
}

/**
 * The option is a NOTE so that it is ignored until it is resolved.
 */
export function create_gap_option({ gap_label, rule_id }: { gap_label: GapLabel; rule_id: string }): Token {
	return { ...create_gap_token({ rule_id, label: `${gap_label}_OPTION`, tag: { 'gap_option': gap_label } }), type: TOKEN_TYPE.NOTE }
}

/**
 * The same-subject gap becomes the given gap, so the clause now has a different participant from its parent.
 * eg. 'the person [that Peter wanted [GAP_SAME_SUB to leave]]' -> 'the person [that Peter wanted [GAP_REL to leave]]'
 */
export function use_same_subject_gap({ clause, gap_label, rule_id }: ReadingOptions): ClauseContents {
	return {
		sub_tokens: clause.sub_tokens
			.filter(token => !is_gap_option(token))
			.map(token => token.token === SAME_SUBJECT_GAP ? create_gap({ gap_label, tag: token.tag, rule_id }) : token),
		tag: { ...clause.tag, 'clause_type': 'patient_clause_different_participant' },
	}
}

export function resolve_gap_option(trigger_context: RuleTriggerContext) {
	const { trigger_token: gap_clause, rule_id } = trigger_context
	const ambiguous_clause = find_ambiguous_clause(gap_clause)
	if (!ambiguous_clause) return
	const { clause, gap_label } = ambiguous_clause

	const problem_counts = {
		subject: count_problems_for_reading({ ambiguous_clause, reading: 'subject', rule_id }),
		object: count_problems_for_reading({ ambiguous_clause, reading: 'object', rule_id }),
	}
	const is_tie = problem_counts.subject === problem_counts.object
	const tie_reading: GapReading = is_person(GAP_NOUN_FINDERS[gap_label](trigger_context)) ? 'subject' : 'object'
	const fewest_invalid_reading: GapReading = problem_counts.subject < problem_counts.object ? 'subject' : 'object'
	const reading = is_tie ? tie_reading : fewest_invalid_reading

	apply_contents({ clause, contents: READINGS[reading]({ clause, gap_label, rule_id }) })
	add_tag_to_token({ token: gap_clause, tag: { 'gap_reading': reading }, rule_id })

	// the checker rules flag an ambiguous gap on the verb next to it
	const gap = clause.sub_tokens.find(token => token.token === `GAP_${gap_label}`)
	if (gap && is_tie && problem_counts.subject === 0) {
		add_tag_to_token({ token: gap, tag: { 'gap_reading': 'ambiguous' }, rule_id })
	}
}

/**
 * Each word without a valid case frame counts as one problem, and so does a gap that no valid case frame takes as an argument,
 * since case frames ignore tokens that none of their rules match.
 * eg. in 'What did Peter want [GAP_SAME_SUB to be seen GAP_INTV_N by John]?' the passive 'see' is valid but nothing takes the gap after it.
 */
function count_problems_for_reading({ ambiguous_clause, reading, rule_id }: { ambiguous_clause: AmbiguousClause; reading: GapReading; rule_id: string }): number {
	const { parent, clause, gap_label } = ambiguous_clause
	const original_contents: ClauseContents = { sub_tokens: clause.sub_tokens, tag: clause.tag }

	apply_contents({ clause, contents: READINGS[reading]({ clause, gap_label, rule_id }) })
	const gap = clause.sub_tokens.find(token => token.token === `GAP_${gap_label}`)
	const word_contexts = [parent, clause]
		.flatMap(({ sub_tokens }) => sub_tokens.map((_, index) => create_word_context({ tokens: sub_tokens, index, rule_id })))
		.filter(context => is_case_frame_word(context.trigger_token))
	word_contexts.forEach(check_word_case_frames)
	const invalid_word_count = word_contexts.filter(({ trigger_token }) => !get_valid_lookups(trigger_token).length).length
	const is_gap_an_argument = word_contexts.some(({ trigger_token }) => get_valid_lookups(trigger_token).some(lookup => takes_argument({ lookup, argument: gap })))
	apply_contents({ clause, contents: original_contents })

	return invalid_word_count + (is_gap_an_argument ? 0 : 1)
}

/**
 * Case frames are only checked here, and their results are replaced when they are checked again by the regular rules.
 * The arguments are only transformed once a sense is selected, so checking has no other side effects.
 *
 * A passive verb is only checked against its passive case frames. Otherwise an object gap after the verb would let the active case frames pass,
 * eg. 'What did Peter want [GAP_SAME_SUB to be seen GAP_INTV_N by John]?' looks like an active 'see' with a patient.
 */
function check_word_case_frames(trigger_context: RuleTriggerContext) {
	const token = trigger_context.trigger_token
	const is_passive = is_verb(token) && is_passive_verb_context(trigger_context.tokens, trigger_context.trigger_index).success
	if (is_passive) {
		check_passive_verb_case_frames(trigger_context)
	} else {
		initialize_word_case_frames(trigger_context)
		check_case_frames(trigger_context)
	}
}

// only the written sense counts when there is one
function get_valid_lookups(token: Token): LookupResult[] {
	return token.lookup_results
		.filter(LOOKUP_FILTERS.IS_IN_ONTOLOGY)
		.filter(lookup => !token.specified_sense || lookup.sense === token.specified_sense)
		.filter(lookup => lookup.case_frame.result.status !== 'invalid')
}

function takes_argument({ lookup, argument }: { lookup: LookupResult; argument: Token | undefined }): boolean {
	return lookup.case_frame.result.valid_arguments.some(({ trigger_contexts }) => trigger_contexts.some(({ trigger_token }) => trigger_token === argument))
}

function find_ambiguous_clause(parent: Token): AmbiguousClause | null {
	for (const clause of parent.sub_tokens.filter(token => token.type === TOKEN_TYPE.CLAUSE)) {
		const gap_option = clause.sub_tokens.find(is_gap_option)
		if (gap_option) {
			return { parent, clause, gap_label: gap_option.tag['gap_option'] as GapLabel }
		}
		const nested = find_ambiguous_clause(clause)
		if (nested) return nested
	}
	return null
}

// 'who' is looked up as 'person', but its features come from the word 'who' so it doesn't get tagged as a person
function is_person(noun: Token | undefined): boolean {
	if (!noun) return false
	return token_has_tag({ token: noun, tag_to_check: { 'noun_category': 'person' } }) || noun.lookup_results[0]?.stem === 'person'
}

function create_word_context({ tokens, index, rule_id }: { tokens: Token[]; index: number; rule_id: string }): RuleTriggerContext {
	return { trigger_token: tokens[index], trigger_index: index, tokens, context_indexes: [], subtoken_indexes: [], rule_id }
}

function create_gap({ gap_label, tag, rule_id }: { gap_label: GapLabel; tag: Tag; rule_id: string }): Token {
	return create_gap_token({ rule_id, label: gap_label, tag: { ...tag } })
}

function apply_contents({ clause, contents }: { clause: Token; contents: ClauseContents }) {
	clause.sub_tokens = contents.sub_tokens
	clause.tag = contents.tag
}

function is_gap_option(token: Token): boolean {
	return token.type === TOKEN_TYPE.NOTE && token_has_tag({ token, tag_to_check: 'gap_option' })
}
