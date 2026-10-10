import { findings } from './types'

export function check_classes_at_end({ file_path, content }: {
	file_path: string
	content: string
}) {
	// Philosophy 5: Classes at the end of elements (in .svelte files)
	if (!file_path.endsWith('.svelte')) return

	// Regex looks for tags with class="..." followed by functional attributes like onclick, disabled, type, href
	const element_regex = /<([a-zA-Z0-9_-]+)\s+([^>]+)>/g
	let match

	while ((match = element_regex.exec(content)) !== null) {
		const tag_name = match[1]
		const attrs_string = match[2]

		if (tag_name === 'script' || tag_name === 'style') continue

		const class_match = attrs_string.match(/\bclass=["'{]/)
		if (!class_match || class_match.index === undefined) continue

		const class_pos = class_match.index
		const rest_of_attrs = attrs_string.slice(class_pos)

		// Check if functional attributes appear after class attribute
		const functional_attr_match = rest_of_attrs.match(/\b(onclick|onchange|onsubmit|onkeydown|type|disabled|href|value)=/)
		if (functional_attr_match) {
			const line_number = content.substring(0, match.index).split('\n').length
			findings.push({
				rule_id: 5,
				rule_title: 'Classes at the end of elements',
				file_path,
				line_number,
				snippet: match[0].slice(0, 80) + '...',
				message: `Element <${tag_name}> has functional attribute "${functional_attr_match[1]}" placed after class attribute.`,
			})
		}
	}
}
