import { CLAUSE_NOTATIONS } from '#lib/parser/clause_notations.js'
import system_instruction_template from './system_instruction.md?raw'
import phase1_rules from './phase1_rules.md?raw'
import repair_instruction_template from './repair_instruction.md?raw'

export type CheckerFeedback = {
	token: string
	label: string
	message: string
	hints: string[]
}

export function build_system_instruction(): string {
	const conventions = system_instruction_template.replace('{{CLAUSE_NOTATIONS}}', () => CLAUSE_NOTATIONS.join(', '))

	return `${conventions}\n\n---\n\n${phase1_rules}`
}

export function build_repair_instruction({ previous_attempt, feedback }: { previous_attempt: string, feedback: CheckerFeedback[] }): string {
	const repair_instruction = repair_instruction_template
		.replace('{{PREVIOUS_ATTEMPT}}', () => previous_attempt)
		.replace('{{FEEDBACK_LINES}}', () => feedback.map(format_feedback_line).join('\n'))

	return `${build_system_instruction()}\n\n---\n\n${repair_instruction}`
}

function format_feedback_line({ token, label, message, hints }: CheckerFeedback): string {
	const line = `- [${label}] near "${token}": ${message}`

	return hints.length ? `${line} Ontology hints: ${hints.join('; ')}` : line
}
