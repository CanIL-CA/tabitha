import { findings } from './types'

const EFFECT_START = /\$effect(\.pre)?\s*\(/
const ASYNC_WORK = /\.then\s*\(|\bawait\b/

export function check_sveltekit_data_boundaries({ file_path, lines }: {
	file_path: string
	lines: string[]
}) {
	// Philosophy 14: SvelteKit data-loading boundaries -- fetch/response-parsing and locale-dependent
	// formatting belong in a load function or a src/lib data-layer module, not inline in a component.
	const is_component = file_path.endsWith('.svelte')
	const is_rune_module = /\.svelte\.(ts|js)$/.test(file_path)
	if (!is_component && !is_rune_module) return

	find_async_work_in_effects(lines).forEach(idx => {
		findings.push({
			rule_id: 14,
			rule_title: 'SvelteKit data-loading boundaries',
			file_path,
			line_number: idx + 1,
			snippet: lines[idx].trim(),
			message: 'Async work inside $effect. An effect reruns whenever anything it reads changes, including state read deep inside the functions it calls, so a load here can loop. Load page data in a load function (+page.ts/+page.server.ts), or fetch in the event handler that needs it.',
		})
	})

	if (!is_component) return

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

/** Line indexes of `await` / `.then(` inside an `$effect` or `$effect.pre` block, tracked by paren depth. */
export function find_async_work_in_effects(lines: string[]): number[] {
	const flagged: number[] = []
	let depth = 0

	lines.forEach((line, idx) => {
		const code = line.trim()
		if (code.startsWith('//') || code.startsWith('*')) return
		if (depth === 0 && !EFFECT_START.test(code)) return

		if (ASYNC_WORK.test(code)) flagged.push(idx)
		depth = Math.max(0, depth + count_char({ text: code, char: '(' }) - count_char({ text: code, char: ')' }))
	})

	return flagged
}

function count_char({ text, char }: { text: string, char: string }): number {
	return text.split(char).length - 1
}
