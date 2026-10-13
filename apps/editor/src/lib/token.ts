import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
import { REGEXES } from '#lib/regexes.js'
import type { CheckerMessage, CheckerMessageLabel, CheckerMessageType, CheckerTextInsertion, CheckerTokenType } from '@tabitha/types'
import type { CaseFrameResult } from '#lib/rules/case_frame/types.js'
import type { RuleTriggerContext } from '#lib/rules/types.js'
import type { LookupResult, MessageInfo, Sentence, Token, Tag } from '#lib/types.js'

export const TOKEN_TYPE: Record<string, CheckerTokenType> = {
	PUNCTUATION: 'Punctuation',
	NOTE: 'Note',
	FUNCTION_WORD: 'FunctionWord',
	LOOKUP_WORD: 'Word',
	CLAUSE: 'Clause',
	ADDED: 'Added',
	PHRASE: 'Phrase',
	GAP: 'Gap',
} as const

export const MESSAGE_TYPE: Record<Uppercase<CheckerMessageLabel>, CheckerMessageType> = {
	ERROR: { label: 'error', severity: 0 },
	WARNING: { label: 'warning', severity: 1 },
	SUGGEST: { label: 'suggest', severity: 2 },
	INFO: { label: 'info', severity: 3 },
} as const

export function create_token(overrides: Partial<Token> & Pick<Token, 'token' | 'type'>): Token {
	return {
		messages: [],
		tag: {},
		specified_sense: '',
		lookup_results: [],
		sub_tokens: [],
		pairing: null,
		pairing_type: null,
		pronoun: null,
		applied_rules: [],
		lookup_terms: overrides.type === TOKEN_TYPE.LOOKUP_WORD ? [overrides.token] : [],
		...overrides,
	}
}

export function create_added_token({ token, message, rule_id = null, insertion }: { token: string; message: CheckerMessage; rule_id?: string | null; insertion?: CheckerTextInsertion }): Token {
	const applied_rules = rule_id ? [`add - ${rule_id}`] : undefined
	return create_token({ token, type: TOKEN_TYPE.ADDED, messages: [message], applied_rules, insertion })
}

export function create_gap_token({ rule_id, label, tag = {} }: { rule_id: string; label: string; tag?: Tag }): Token {
	const token = `GAP_${label}`
	const gap_result = create_lookup_result({ stem: token, part_of_speech: 'Noun' })
	const applied_rules = [`add - ${rule_id}`]
	return create_token({ token, type: TOKEN_TYPE.GAP, lookup_results: [gap_result], tag, applied_rules })
}

export function create_clause_token({ sub_tokens, tag = { clause_type: 'subordinate_clause' } }: { sub_tokens: Token[]; tag?: Tag }): Token {
	return create_token({ token: '', type: TOKEN_TYPE.CLAUSE, sub_tokens, tag })
}

export function get_message_type(label: CheckerMessageLabel): CheckerMessageType {
	return Object.values(MESSAGE_TYPE).find(message_type => message_type.label === label)!
}

/**
 * Set the message on the given token in the message info, or the trigger token by default.
 * The message will be formatted based on the given token and the token context values within the rule context.
 */
export function set_message({ trigger_context, message_info }: { trigger_context: RuleTriggerContext; message_info: MessageInfo }) {
	const token_to_flag = message_info.token_to_flag ?? trigger_context.trigger_token

	const message_type = Object.values(MESSAGE_TYPE).find(message_type => message_type.label in message_info)
	const message_text = message_type ? message_info[message_type.label] : undefined
	if (!message_text || !message_type) {
		return
	}

	const message: CheckerMessage = {
		...message_type,
		message: message_info.plain ? message_text : format_token_message({ trigger_context, message: message_text, token: token_to_flag }),
		rule_id: trigger_context.rule_id,
	}
	set_message_plain({ token: token_to_flag, message })
}

/**
 * Set the message on the given token. No formatting is performed.
 */
export function set_message_plain({ token, message }: { token: Token; message: CheckerMessage }) {
	token.messages.push(message)
	token.applied_rules.push(`message:${message.label} - ${message.rule_id}`)
}

/**
 * Format the message based on the trigger token or the given token if provided.
 * The message will also be formatted based on the token context values within the rule context.
 */
export function format_token_message({ trigger_context: { tokens, trigger_token, context_indexes }, message, token = trigger_token }: { trigger_context: RuleTriggerContext; message: string; token?: Token }): string {
	return context_indexes.reduce((text, token_index, context_number) => replace_context_markers({ text, token_index, context_number }), replace_markers({ text: message, token }))

	function replace_context_markers({ text, token_index, context_number }: {
		text: string
		token_index: number
		context_number: number
	}): string {
		return replace_markers({ text, token: tokens[token_index], context_prefix: `${context_number}:` })
	}

	function replace_markers({ text, token, context_prefix = '' }: { text: string; token: Token; context_prefix?: string }): string {
		const result = token.lookup_results.at(0)
		const stem = result?.stem ?? token.token
		return text
			.replaceAll(`{${context_prefix}stem}`, stem)
			.replaceAll(`{${context_prefix}token}`, token.token)
			.replaceAll(`{${context_prefix}category}`, result?.part_of_speech ?? 'word')
			.replaceAll(`{${context_prefix}sense}`, result ? stem_with_sense(result) : stem)
	}
}

export function token_has_error(token: Pick<Token, 'messages'>): boolean {
	return token_has_message({ token, type_to_check: 'error' })
}

export function token_has_message({ token, type_to_check = null }: { token: Pick<Token, 'messages'>; type_to_check?: CheckerMessageLabel | null }): boolean {
	return type_to_check
		? token.messages.some(({ label }) => label === type_to_check)
		: token.messages.length > 0
}

export function is_one_part_of_speech(token: Pick<Token, 'lookup_results'>): boolean {
	const part_of_speech_0 = token.lookup_results.at(0)?.part_of_speech
	if (!part_of_speech_0) {
		return false
	}
	return token.lookup_results.every(LOOKUP_FILTERS.IS_PART_OF_SPEECH(part_of_speech_0))
}

export function split_stem_and_sense(term: string): { stem: string, sense: string } {
	const match = term.match(REGEXES.EXTRACT_STEM_AND_SENSE)!
	return { stem: match[1], sense: match[2] ?? '' }
}

export function add_tag_to_token({ token, tag, rule_id = 'Unknown' }: { token: Token; tag: Tag; rule_id?: string }) {
	token.tag = { ...token.tag, ...tag }
	token.applied_rules.push(`tag:${Object.keys(tag).join('|')} - ${rule_id}`)
}

/**
 * This checks if there is any value for a specific key, or if any of the given values
 * are present for the specified keys.
 */
export function token_has_tag({ token, tag_to_check }: { token: Token; tag_to_check: Tag | string | (Tag | string)[] }): boolean {
	if (Array.isArray(tag_to_check)) {
		return tag_to_check.some(tag => token_has_tag({ token, tag_to_check: tag }))
	}
	if (typeof tag_to_check === 'string') {
		const filter_keys = tag_to_check.split('|')
		return filter_keys.some(key => (token.tag[key]?.length ?? 0) > 0)
	}
	return Object.entries(tag_to_check).every(([key, value]) => {
		const tag_values = token.tag[key]?.split('|') ?? []
		if (value.includes('|')) {
			const filter_values = value.split('|')
			return filter_values.some(tag => tag_values.includes(tag))
		} else if (value.includes('&')) {
			const filter_values = value.split('&')
			return filter_values.every(tag => tag_values.includes(tag))
		} else {
			return tag_values.includes(value)
		}
	})
}

export function flatten_token(token: Token): Token[] {
	if (token.type === TOKEN_TYPE.CLAUSE) {
		return token.sub_tokens.flatMap(flatten_token)
	}
	return [token]
}

export function flatten_sentence(sentence: Sentence): Token[] {
	return flatten_token(sentence.clause)
}

export function stem_with_sense(result: { stem: string, sense: string }): string {
	return result.sense.length ? `${result.stem}-${result.sense}` : result.stem
}

type CreatLookupResultOptions = Partial<Omit<LookupResult, 'case_frame'>>
	& Pick<LookupResult, 'stem' | 'part_of_speech'>
	& { case_frame?: CaseFrameResult }

export function create_lookup_result(overrides: CreatLookupResultOptions): LookupResult {
	return {
		sense: '',
		level: -1,
		gloss: '',
		categorization: '',
		ontology_status: 'unknown',
		how_to_entries: [],
		...overrides,
		case_frame: {
			rules: [],
			usage: {
				possible_roles: [],
				required_roles: [],
			},
			result: overrides.case_frame ?? create_case_frame(),
		},
		form: overrides.form?.toLowerCase() ?? 'stem',
	}
}

export function create_case_frame(overrides: Partial<CaseFrameResult> = {}): CaseFrameResult {
	return {
		status: 'unchecked',
		valid_arguments: [],
		extra_arguments: [],
		missing_arguments: [],
		...overrides,
	}
}
