import { findings } from './types'

const TEMPLATE_LITERAL_PATTERN = /`([^`]*)`/g
const SYSTEM_INSTRUCTION_PROXIMITY_WINDOW = 120

export function check_ai_prompts_in_md_files({ file_path, content }: {
	file_path: string
	content: string
}) {
	// Philosophy 15: AI prompts live in separate Markdown files -- a system_instruction sent to
	// the AI client should be sourced from an imported *.md file (via '?raw'), not authored inline
	// as a template literal, so the prompt reads and edits like the document it actually is.
	if (!file_path.endsWith('.ts')) return

	const regex = new RegExp(TEMPLATE_LITERAL_PATTERN.source, TEMPLATE_LITERAL_PATTERN.flags)
	let match: RegExpExecArray | null

	while ((match = regex.exec(content)) !== null) {
		const literal_body = match[1]
		if (!literal_body.includes('\n')) continue // single-line strings aren't a prompt-extraction concern

		const preceding_context = content.slice(Math.max(0, match.index - SYSTEM_INSTRUCTION_PROXIMITY_WINDOW), match.index)
		if (!/system_instruction/.test(preceding_context)) continue

		const line_number = content.substring(0, match.index).split('\n').length
		findings.push({
			rule_id: 15,
			rule_title: 'AI prompts live in separate Markdown files',
			file_path,
			line_number,
			snippet: literal_body.trim().replace(/\s+/g, ' ').slice(0, 80),
			message: "system_instruction is authored as an inline multi-line template literal. Move the prompt text to a sibling *.md file and import it via '?raw' instead.",
		})
	}
}
