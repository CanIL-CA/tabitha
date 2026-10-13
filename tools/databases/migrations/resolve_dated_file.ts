import { Glob } from 'bun'
import { create_logger } from './log'

const log = create_logger('File resolution')

/**
 * Resolves a dated file by exact match first (`{dir}/{prefix}_{date}.{ext}`), falling back to the
 * most recently dated `{dir}/{prefix}_*.{ext}` file when the exact date isn't present. Returns
 * undefined if no file matching `{prefix}` exists at all.
 */
export async function resolve_dated_file({ dir, prefix, date, ext, silent = false }: {
	dir: string
	prefix: string
	date: string
	ext: string
	silent?: boolean
}): Promise<string | undefined> {
	const exact_path = `${dir}/${prefix}_${date}.${ext}`
	if (await Bun.file(exact_path).exists()) return exact_path

	// Date-shaped, not `*`, so a prefix never matches a longer name that merely starts with it.
	const files = Array.from(new Glob(`${prefix}_????-??-??.${ext}`).scanSync(dir))
	files.sort() // lexicographical sort will serve correctly for YYYY-MM-DD
	const latest = files.pop()
	if (!latest) return undefined

	if (!silent) log.warn(`Exact file ${prefix}_${date}.${ext} not found in ${dir}. Using fallback: ${latest}`)
	return `${dir}/${latest}`
}
