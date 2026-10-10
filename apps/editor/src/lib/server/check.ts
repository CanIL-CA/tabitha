import { backtranslate } from '#lib/backtranslator/index.js'
import { parse } from '#lib/parser/index.js'
import { RULES } from '#lib/rules/index.js'
import { apply_rules } from '#lib/rules/rules_processor.js'
import { apply_text_insertions } from '#lib/text_insertions.js'

import type {
	EditorCheckResult,
	CheckStatus,
	CheckerMessage,
	CheckerCaseFrameInfo,
	CheckerLookupResult,
	CheckerToken,
} from '@tabitha/types'
import type { CaseFrame, RoleMatchResult, RoleTag } from '#lib/rules/case_frame/types.js'
import type { LookupResult, Sentence, Token } from '#lib/types.js'

export async function run_check(text: string): Promise<EditorCheckResult> {
	const sentences = await parse(text)
	return to_check_result({ sentences, checked_sentences: apply_rules({ sentences, rules: RULES.CHECKER }) })
}

// Inserts the checker's auto-fix tokens into the text, then checks the fixed text
export async function run_check_with_auto_fixes(text: string): Promise<EditorCheckResult> {
	const sentences = await parse(text)
	const checked_sentences = apply_rules({ sentences, rules: RULES.CHECKER })
	const auto_fix_tokens = checked_sentences.flatMap(({ clause }) => expand_internal_token(clause)).filter(token => token.insertion)
	if (!auto_fix_tokens.length) return to_check_result({ sentences, checked_sentences })

	const auto_fixes = auto_fix_tokens.map(token => token.insertion!)
	const { text: fixed_text, inserted_ranges } = apply_text_insertions({ text, insertions: auto_fixes })
	const parsed_fixed_sentences = await parse(fixed_text)
	const fixed_sentences = apply_rules({ sentences: parsed_fixed_sentences, rules: RULES.CHECKER })

	inserted_ranges.forEach(({ start, end }, index) => {
		const inserted_token = fixed_sentences
			.flatMap(({ clause }) => expand_internal_token(clause))
			.find(({ source_range }) => source_range && source_range.start >= start && source_range.end <= end)
		if (!inserted_token) return

		inserted_token.auto_fix = { message: auto_fix_tokens[index].messages[0].message, text: auto_fixes[index].text, start, end }
	})

	return { ...to_check_result({ sentences: parsed_fixed_sentences, checked_sentences: fixed_sentences }), auto_fixes }
}

function to_check_result({ sentences, checked_sentences }: { sentences: Sentence[]; checked_sentences: Sentence[] }): EditorCheckResult {
	const tokens = simplify_tokens(checked_sentences)
	return { status: get_status(tokens), tokens, back_translation: backtranslate(sentences) }
}

function expand_internal_token(token: Token): Token[] {
	return [token, ...token.sub_tokens.flatMap(expand_internal_token)]
}

export function get_status(tokens: CheckerToken[]): CheckStatus {
	const all_messages = tokens.flatMap(expand_token).flatMap(token => token.messages)
	const has_error = all_messages.some(msg => msg.label === 'error')
	const has_warning = all_messages.some(msg => msg.label === 'warning')

	if (has_error) {
		return 'error'
	} else if (has_warning) {
		return 'warning'
	}

	return 'ok'
}

export function expand_token(token: CheckerToken): CheckerToken[] {
	if (token.pairing) {
		return [token, token.pairing]
	} else if (token.pronoun) {
		return [token, token.pronoun]
	} else if (token.sub_tokens.length) {
		return [token, ...token.sub_tokens.flatMap(expand_token)]
	} else {
		return [token]
	}
}

function simplify_tokens(sentences: Sentence[]): CheckerToken[] {
	return sentences.map(({ clause }) => simplify_token(clause))

	function simplify_token({ token, type, tag, messages, lookup_results, pairing, pairing_type, pronoun, sub_tokens, applied_rules, auto_fix }: Token): CheckerToken {
		return {
			token,
			type,
			tag,
			messages: messages.toSorted((a: CheckerMessage, b: CheckerMessage) => a.severity - b.severity),
			lookup_results: lookup_results.map(simplify_lookup),
			pairing: pairing ? simplify_token(pairing) : null,
			pairing_type,
			pronoun: pronoun ? simplify_token(pronoun) : null,
			sub_tokens: sub_tokens.map(simplify_token),
			applied_rules,
			...auto_fix && { auto_fix },
		}
	}

	function simplify_lookup({ stem, part_of_speech, sense, form, level, gloss, categorization, ontology_status, how_to_entries, case_frame }: LookupResult): CheckerLookupResult {
		return {
			stem,
			part_of_speech,
			sense,
			form,
			level,
			gloss,
			categorization,
			ontology_status,
			how_to_entries,
			case_frame: simplify_case_frame(case_frame),
		}
	}

	function simplify_case_frame({ usage: { possible_roles, required_roles }, result: { status, valid_arguments, extra_arguments, missing_arguments } }: CaseFrame): CheckerCaseFrameInfo {
		return {
			status,
			valid_arguments: valid_arguments.reduce<Record<RoleTag, string>>((result, match) => simplify_argument_result({ result, match }), {}),
			extra_arguments: extra_arguments.reduce<Record<RoleTag, string>>((result, match) => simplify_argument_result({ result, match }), {}),
			missing_arguments,
			possible_roles,
			required_roles,
		}

		function simplify_argument_result({ result, match }: {
			result: Record<RoleTag, string>
			match: RoleMatchResult
		}) {
			const { trigger_token } = match.trigger_context
			return {
				...result,
				[match.role_tag]: trigger_token.lookup_results.at(0)?.stem ?? trigger_token.token,
			}
		}
	}
}
