import { expect } from 'vitest'
import { get_message_type, TOKEN_TYPE, create_token, create_lookup_result, create_clause_token } from './token'
import type { CheckerMessageLabel, OntologyStatus, PairingType, PartOfSpeech } from '@tabitha/types'
import type { Token, LookupResult, Sentence, Tag } from '#lib/types.js'

export function expect_error({ token, message }: { token: Token | null | undefined; message: string }) {
	expect_message({ token, label: 'error', message })
}

export function expect_message({ token, label, message }: { token: Token | null | undefined; label: CheckerMessageLabel; message: string }) {
	expect(token?.messages).toContainEqual(expect.objectContaining({ ...get_message_type(label), message }))
}

export function expect_error_to_match({ token, regex }: { token: Token | null | undefined; regex: RegExp }) {
	expect_message_to_match({ token, message_type: 'error', regex })
}

export function expect_message_to_match({ token, message_type, regex }: { token: Token | null | undefined; message_type: CheckerMessageLabel; regex: RegExp }) {
	expect(token?.messages[0].label).toBe(message_type)
	expect(token?.messages[0].message).toMatch(regex)
}

export function expect_no_message(token: Token | null | undefined) {
	expect(token?.messages.length).toBe(0)
}

export function create_lookup_token_for_test({ token, lookup_results = [], tag = {}, lookup_terms }: { token: string; lookup_results?: LookupResult[]; tag?: Tag, lookup_terms?: string[] }): Token {
	return create_token({ token, type: TOKEN_TYPE.LOOKUP_WORD, tag, lookup_results, lookup_terms })
}

export function create_pairing_token_for_test({ left, right, pairing_type = 'simple-complex' }: { left: Token; right: Token; pairing_type?: PairingType }): Token {
	left.pairing = right
	left.pairing_type = pairing_type
	return left
}

export function lookup_result_for_test({ stem, sense = 'A', part_of_speech = 'Noun', level = 1, ontology_status = 'in ontology' as OntologyStatus }: { stem: string; sense?: string; part_of_speech?: PartOfSpeech; level?: number; ontology_status?: OntologyStatus }): LookupResult {
	return create_lookup_result({ stem, part_of_speech, sense, level, ontology_status })
}

export function create_sentence_for_test(tokens: Token[]): Sentence {
	return { clause: create_clause_token({ sub_tokens: tokens, tag: { 'clause_type': 'main_clause' } }) }
}