import { findings } from './types'

const LAYOUT_UTILITY_PATTERN = /^(flex|grid|inline-flex|inline-grid|items-|justify-|content-|place-|gap-\d)/
const DAISYUI_STRUCTURAL_PATTERN = /^(card-title|card-actions|btn|navbar|modal-action|menu|tabs|steps|alert)/

export function check_prose_scoping({ file_path, content }: {
	file_path: string
	content: string
}) {
	// Philosophy 13: Scope "prose" to content; escape with "not-prose"
	if (!file_path.endsWith('.svelte')) return

	const class_attr_regex = /class=["']([^"']*)["']/g
	let match

	while ((match = class_attr_regex.exec(content)) !== null) {
		const classes = match[1].split(/\s+/).filter(Boolean)
		const has_prose = classes.some(c => c === 'prose' || c.startsWith('prose-'))
		if (!has_prose) continue

		const conflicting_classes = classes.filter(c => LAYOUT_UTILITY_PATTERN.test(c) || DAISYUI_STRUCTURAL_PATTERN.test(c))
		if (conflicting_classes.length === 0) continue

		const line_number = content.substring(0, match.index).split('\n').length
		findings.push({
			rule_id: 13,
			rule_title: 'Scope prose to content; escape with not-prose',
			file_path,
			line_number,
			snippet: match[0],
			message: `Element combines "prose" typography with layout/component class(es) (${conflicting_classes.join(', ')}). Move layout onto a wrapping element and keep "prose" scoped to a content-only block, or add "not-prose" to the nested component.`,
		})
	}
}
