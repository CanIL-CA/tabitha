import { TOKEN_TYPE } from '#lib/token.js'
import { create_token_filter } from '#lib/rules/rules_parser.js'
import type { LookupResult, Token } from '#lib/types.js'
import type { RuleTriggerContext } from '#lib/rules/types.js'

/**
 * Some single mistakes elsewhere in a sentence make a Verb's case frame look invalid.
 * These detect them, so the case frame check can point at the real mistake instead.
 */

export const WHERE_RELATIVIZER_HINT = "This may be caused by 'where' used as a relativizer. Fix that first."
export const UNBRACKETED_CLAUSE_MESSAGE = "Put brackets around the clause after '{stem}', e.g. '{stem} [X do Y]'."

const is_verb = create_token_filter({ 'category': 'Verb' })

function is_where_relativizer_clause(token: Token): boolean {
	if (token.type !== TOKEN_TYPE.CLAUSE) return false

	return token.sub_tokens.find(sub_token => sub_token.token !== '[')?.token === 'where'
}

/**
 * e.g. 'near the place [where the priests are standing]' reads the relative clause as a patient clause of the Verb.
 * 'where' as a relativizer already has its own error.
 */
export function has_where_relativizer_argument(lookup_results: LookupResult[]): boolean {
	return lookup_results.some(({ case_frame }) =>
		case_frame.result.extra_arguments.some(({ trigger_context }) => is_where_relativizer_clause(trigger_context.trigger_token)))
}

/**
 * e.g. 'let those people touch Jesus' reads 'those people' as an extra patient and 'touch' as a second Verb,
 * when the real problem is the missing brackets in 'let [those people touch Jesus]'.
 */
export function is_missing_brackets_around_clause({ trigger_token, tokens, trigger_index }: RuleTriggerContext): boolean {
	const every_sense_expects_clause_but_got_patient = trigger_token.lookup_results.every(({ case_frame: { result } }) =>
		result.missing_arguments.includes('patient_clause_different_participant')
		&& result.extra_arguments.some(({ role_tag }) => role_tag === 'patient'))

	return every_sense_expects_clause_but_got_patient && tokens.slice(trigger_index + 1).some(is_verb)
}
