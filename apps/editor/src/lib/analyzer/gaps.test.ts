import { describe, expect, test } from 'vitest'
import { replace_gaps } from './gaps'
import { clause, np, phrase, vp, word, fw } from './test_helps'
import { TOKEN_TYPE, create_gap_token } from '#lib/token.js'
import type { Token } from '#lib/types.js'

const texts = (tokens: Token[]) => tokens.map(token => token.token)

describe('gaps', () => {
	const gap = (label: string) => create_gap_token({ rule_id: 'test', label })
	const john = () => word({ stem: 'John', part_of_speech: 'Noun' })
	const replace_in_main_clause = (sub_tokens: Token[]) => replace_gaps([{ clause: clause({ clause_type: 'main_clause', sub_tokens }) }])[0].clause.sub_tokens

	test('GAP_REL is replaced with the modified NP, without its relative clause', () => {
		const relative_clause = clause({ clause_type: 'relative_clause', sub_tokens: [...np({ role: 'agent', contents: [gap('REL')] }), ...vp('leave')] })
		const tokens = replace_in_main_clause([
			...np({ role: 'agent', contents: [john()] }),
			...vp('see'),
			...np({ role: 'patient', contents: [word({ stem: 'man', part_of_speech: 'Noun' }), relative_clause] }),
		])

		const filled_clause = tokens.find(token => token.type === TOKEN_TYPE.CLAUSE)!
		expect(texts(filled_clause.sub_tokens)).toEqual(['{NP', 'man', '}', '{VP', 'leave', '}'])
		expect(filled_clause.sub_tokens[0].tag).toEqual({ role: 'agent' })
	})

	test('GAP_SAME_SUB is replaced with the agent NP of the parent clause', () => {
		const same_subject_clause = clause({ clause_type: 'patient_clause_same_participant', sub_tokens: [...np({ contents: [gap('SAME_SUB')] }), ...vp('go')] })
		const tokens = replace_in_main_clause([...np({ role: 'agent', contents: [john()] }), ...vp('want'), same_subject_clause])

		expect(texts(tokens.at(-1)!.sub_tokens)).toEqual(['{NP', 'John', '}', '{VP', 'go', '}'])
	})

	test('GAP_SAME_SUB is replaced with every agent NP of the parent clause, each keeping the gap role', () => {
		const same_subject_clause = clause({ clause_type: 'patient_clause_same_participant', sub_tokens: [...np({ role: 'patient', contents: [gap('SAME_SUB')] }), ...vp('go')] })
		const tokens = replace_in_main_clause([
			...np({ role: 'agent', contents: [john()] }),
			...np({ role: 'agent', contents: [word({ stem: 'and', part_of_speech: 'Conjunction' }), word({ stem: 'Mary', part_of_speech: 'Noun' })] }),
			...vp('want'),
			same_subject_clause,
		])

		const filled_tokens = tokens.at(-1)!.sub_tokens
		expect(texts(filled_tokens)).toEqual(['{NP', 'John', '}', '{NP', 'and', 'Mary', '}', '{VP', 'go', '}'])
		expect(filled_tokens[3].tag).toEqual({ role: 'patient' })
	})

	test('GAP_SAME_SUB is replaced with the patient NP of a passive parent clause', () => {
		const same_subject_clause = clause({ clause_type: 'patient_clause_same_participant', sub_tokens: [...np({ contents: [gap('SAME_SUB')] }), ...vp('go')] })
		const passive_vp = phrase({ type: 'VP', contents: [word({ stem: 'be', part_of_speech: 'Verb', tag: { auxiliary: 'passive' } }), word({ stem: 'send', part_of_speech: 'Verb' })] })
		const tokens = replace_in_main_clause([
			...np({ role: 'patient', contents: [john()] }),
			...passive_vp,
			...np({ role: 'agent', contents: [fw({ token: 'by', tag: { 'pre_np_adposition': 'verb_argument' } }), word({ stem: 'Mary', part_of_speech: 'Noun' })] }),
			same_subject_clause,
		])

		expect(texts(tokens.at(-1)!.sub_tokens)).toEqual(['{NP', 'John', '}', '{VP', 'go', '}'])
	})

	test('GAP_SAME_SUB uses a parent agent that was itself a filled gap', () => {
		const same_subject_clause = clause({ clause_type: 'patient_clause_same_participant', sub_tokens: [...np({ contents: [gap('SAME_SUB')] }), ...vp('go')] })
		const relative_clause = clause({ clause_type: 'relative_clause', sub_tokens: [...np({ role: 'agent', contents: [gap('REL')] }), ...vp('want'), same_subject_clause] })
		const tokens = replace_in_main_clause([...np({ role: 'agent', contents: [word({ stem: 'man', part_of_speech: 'Noun' }), relative_clause] }), ...vp('leave')])

		const filled_relative_clause = tokens.find(token => token.type === TOKEN_TYPE.CLAUSE)!
		expect(texts(filled_relative_clause.sub_tokens.at(-1)!.sub_tokens)).toEqual(['{NP', 'man', '}', '{VP', 'go', '}'])
	})

	test('the agent of a patient_from_clause clause is copied into a new patient NP directly before the clause', () => {
		const patient_clause = clause({ clause_type: 'patient_clause_different_participant', sub_tokens: [...np({ role: 'agent', contents: [john()] }), ...vp('go')] })
		patient_clause.tag = { ...patient_clause.tag, gap: 'patient_from_clause' }
		const tokens = replace_in_main_clause([...np({ role: 'agent', contents: [word({ stem: 'Mary', part_of_speech: 'Noun' })] }), ...vp('tell'), patient_clause])

		expect(texts(tokens)).toEqual(['{NP', 'Mary', '}', '{VP', 'tell', '}', '{NP', 'John', '}', '['])
		expect(tokens[6].tag).toEqual({ role: 'patient' })
		expect(texts(tokens.at(-1)!.sub_tokens)).toEqual(['{NP', 'John', '}', '{VP', 'go', '}'])
	})

	test('every agent of a patient_from_clause clause is copied out in order, each into its own patient NP', () => {
		const patient_clause = clause({ clause_type: 'patient_clause_different_participant', sub_tokens: [
			...np({ role: 'agent', contents: [john()] }),
			...np({ role: 'agent', contents: [word({ stem: 'and', part_of_speech: 'Conjunction' }), word({ stem: 'Mary', part_of_speech: 'Noun' })] }),
			...vp('go'),
		] })
		patient_clause.tag = { ...patient_clause.tag, gap: 'patient_from_clause' }
		const tokens = replace_in_main_clause([...vp('tell'), patient_clause])

		expect(texts(tokens)).toEqual(['{VP', 'tell', '}', '{NP', 'John', '}', '{NP', 'and', 'Mary', '}', '['])
		expect(tokens[3].tag).toEqual({ role: 'patient' })
		expect(tokens[6].tag).toEqual({ role: 'patient' })
		expect(texts(tokens.at(-1)!.sub_tokens)).toEqual(['{NP', 'John', '}', '{NP', 'and', 'Mary', '}', '{VP', 'go', '}'])
		expect(tokens.at(-1)!.sub_tokens[0].tag).toEqual({ role: 'agent' })
	})

	test('a copied agent NP keeps its other tags, with the role changed to patient', () => {
		const agent_np = np({ role: 'agent', contents: [john()] })
		agent_np[0].tag = { role: 'agent', relation: 'genitive_saxon' }
		const patient_clause = clause({ clause_type: 'patient_clause_different_participant', sub_tokens: [...agent_np, ...vp('go')] })
		patient_clause.tag = { ...patient_clause.tag, gap: 'patient_from_clause' }
		const tokens = replace_in_main_clause([...vp('tell'), patient_clause])

		expect(tokens[3].tag).toEqual({ role: 'patient', relation: 'genitive_saxon' })
	})

	test('a patient_from_clause clause without an agent is left alone', () => {
		const patient_clause = clause({ clause_type: 'patient_clause_different_participant', sub_tokens: vp('go') })
		patient_clause.tag = { ...patient_clause.tag, gap: 'patient_from_clause' }
		const tokens = replace_in_main_clause([...vp('tell'), patient_clause])

		expect(texts(tokens)).toEqual(['{VP', 'tell', '}', '['])
	})

	const what = () => word({ stem: 'thing', part_of_speech: 'Noun', tag: { determiner: 'interrogative' } })

	test('the interrogative NP of the same clause is moved to GAP_INTV_N', () => {
		const tokens = replace_in_main_clause([
			...np({ contents: [what()] }),
			...np({ role: 'agent', contents: [john()] }),
			...vp('see'),
			...np({ role: 'patient', contents: [gap('INTV_N')] }),
		])

		expect(texts(tokens)).toEqual(['{NP', 'John', '}', '{VP', 'see', '}', '{NP', 'thing', '}'])
		expect(tokens.at(-3)!.tag).toEqual({ role: 'patient' })
	})

	test('the interrogative NP is moved to a GAP_INTV_N in a nested clause', () => {
		const patient_clause = clause({ clause_type: 'patient_clause_different_participant', sub_tokens: [...np({ role: 'agent', contents: [john()] }), ...vp('do'), ...np({ role: 'patient', contents: [gap('INTV_N')] })] })
		const tokens = replace_in_main_clause([...np({ contents: [what()] }), ...vp('want'), patient_clause])

		expect(texts(tokens)).toEqual(['{VP', 'want', '}', '['])
		expect(texts(tokens.at(-1)!.sub_tokens.slice(-3))).toEqual(['{NP', 'thing', '}'])
	})

	test('the interrogative NP stays in place when there is no GAP_INTV_N', () => {
		const tokens = replace_in_main_clause([...np({ role: 'agent', contents: [what()] }), ...vp('leave')])

		expect(texts(tokens)).toEqual(['{NP', 'thing', '}', '{VP', 'leave', '}'])
	})
})
