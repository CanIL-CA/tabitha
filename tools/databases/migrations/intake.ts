import AdmZip from 'adm-zip'
import { Glob } from 'bun'
import { mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import { create_logger } from './log'

const log = create_logger('Intake')

export type IntakeResult = {
	working_dir: string
	cleanup?: () => Promise<void>
}

/**
 * Normalizes a migration source -- either a directory of loose TBTA `.sqlite`/`.new` exports, or a
 * zip bundle containing them -- into a plain working directory the rest of the pipeline can read
 * from. Uses a pure-JS zip library rather than shelling out to a platform-specific unzip tool
 * (`unzip`/`tar`/`Expand-Archive` all differ by OS, and this repo's contributors aren't all on the
 * same one).
 */
export async function intake(source: string): Promise<IntakeResult> {
	if (extname(source).toLowerCase() !== '.zip') {
		return { working_dir: source }
	}

	log.step(`Extracting ${source}...`)
	const extract_dir = await mkdtemp(join(tmpdir(), 'tabitha-migration-intake-'))
	new AdmZip(source).extractAllTo(extract_dir, true)

	const working_dir = await resolve_extracted_root(extract_dir)

	return {
		working_dir,
		cleanup: () => rm(extract_dir, { recursive: true, force: true }),
	}
}

// Some zip tools wrap a folder's contents in a single top-level directory named after the archive
// (e.g. "TBTA 6-25-26.zip" -> "TBTA 6-25-26/Bible.sqlite" instead of "Bible.sqlite" at the root).
// Look one level deeper if nothing is found directly at the extraction root.
async function resolve_extracted_root(extract_dir: string): Promise<string> {
	if (has_tbta_files(extract_dir)) return extract_dir

	const entries = await readdir(extract_dir, { withFileTypes: true })
	const subdirs = entries.filter(entry => entry.isDirectory())

	if (subdirs.length === 1) {
		const nested_dir = join(extract_dir, subdirs[0].name)
		if (has_tbta_files(nested_dir)) return nested_dir
	}

	throw new Error(`No .sqlite or .new files found directly in the extracted zip contents (or a single wrapping folder) at ${extract_dir}. Check the zip's internal structure.`)

	// A TBTA delivery may be nothing but .new upgrade files, which staging renames to .sqlite later.
	function has_tbta_files(dir: string): boolean {
		return Array.from(new Glob('*.{sqlite,new}').scanSync(dir)).length > 0
	}
}
