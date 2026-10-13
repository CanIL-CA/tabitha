import { findings } from './types'

export function check_sveltekit_data_boundaries({ file_path, lines }: {
	file_path: string
	lines: string[]
}) {
	// Philosophy 14: SvelteKit data-loading boundaries -- fetch/response-parsing and locale-dependent
	// formatting belong in a load function or a src/lib data-layer module, not inline in a component.
	if (!file_path.endsWith('.svelte')) return

	lines.forEach((line, idx) => {
		const trimmed = line.trim()
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

		if (/\bfetch\s*\(/.test(trimmed)) {
			findings.push({
				rule_id: 14,
				rule_title: 'SvelteKit data-loading boundaries',
				file_path,
				line_number: idx + 1,
				snippet: trimmed,
				message: 'Direct fetch() call in a component. Move data fetching into a src/lib data-layer module (or a +page.ts/+layout.ts load function).',
			})
			return
		}

		const locale_match = trimmed.match(/\.toLocale(String|DateString|TimeString)\s*\(/)
		if (locale_match) {
			findings.push({
				rule_id: 14,
				rule_title: 'SvelteKit data-loading boundaries',
				file_path,
				line_number: idx + 1,
				snippet: trimmed,
				message: `Direct .toLocale${locale_match[1]}() call in a component. Resolve locale/timezone in a universal load (+layout.ts/+page.ts) and format via a shared src/lib utility instead.`,
			})
		}
	})
}
