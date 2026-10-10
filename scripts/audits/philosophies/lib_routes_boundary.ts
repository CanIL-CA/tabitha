import { dirname, resolve, sep } from 'node:path'
import { findings } from './types'

const PARENT_RELATIVE_IMPORT_PATTERN = /from\s+['"](\.\.\/[^'"]+)['"]/g

// This isn't one of AGENTS.md's 14 numbered "Development Philosophies" -- it's the
// app-internal lib/routes package-boundary rule documented under "Monorepo Architecture &
// Package Boundaries". A dedicated, out-of-range id keeps it from colliding with (or being
// mistaken for) a numbered philosophy.
const RULE_ID = 20

export function check_lib_routes_boundary({ file_path, content }: {
	file_path: string
	content: string
}) {
	// Only a file under src/lib can violate this -- src/routes depending on src/lib is the
	// intended direction. Only imports that climb at least one directory (`../`) can possibly
	// resolve outside the lib subtree, so a same-directory `./sibling` import never needs checking.
	const lib_marker = `${sep}src${sep}lib${sep}`
	if (!file_path.includes(lib_marker)) return

	const dir = dirname(file_path)
	const regex = new RegExp(PARENT_RELATIVE_IMPORT_PATTERN)
	let match: RegExpExecArray | null

	while ((match = regex.exec(content)) !== null) {
		const specifier = match[1]
		const resolved = resolve(dir, specifier)
		if (!resolved.includes(`${sep}src${sep}routes${sep}`)) continue

		const line_number = content.substring(0, match.index).split('\n').length
		findings.push({
			rule_id: RULE_ID,
			rule_title: 'App-internal lib/routes boundary',
			file_path,
			line_number,
			snippet: match[0].trim(),
			message: `Imports from "${specifier}", which resolves into src/routes. src/lib must not depend on route-specific code -- move the shared type or helper into src/lib instead.`,
		})
	}
}
