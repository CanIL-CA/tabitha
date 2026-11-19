import AdmZip from 'adm-zip'
import { Glob } from 'bun'
import { cp, mkdir, mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import { create_logger } from './log'

const log = create_logger('Intake')

export type IntakeResult = {
	working_dir: string
	cleanup: () => Promise<void>
}

/**
 * Normalizes a migration source -- either a directory of TBTA `.sqlite`/`.new` exports, or a zip
 * bundle containing them -- into a fresh temp working directory the rest of the pipeline can read
 * from and write into, leaving the delivery itself untouched. Database files get the plain names
 * TBTA and tbta_utils expect (`English_2026-11-19.tbta.sqlite` -> `English.sqlite`). Uses a pure-JS
 * zip library rather than shelling out to a platform-specific unzip tool (`unzip`/`tar`/
 * `Expand-Archive` all differ by OS, and this repo's contributors aren't all on the same one).
 */
export async function intake(source: string): Promise<IntakeResult> {
	const temp_dir = await mkdtemp(join(tmpdir(), 'tabitha-migration-intake-'))
	const cleanup = () => rm(temp_dir, { recursive: true, force: true })

	try {
		const delivery_dir = extname(source).toLowerCase() === '.zip'
			? await extract_zip({ source, extract_dir: join(temp_dir, 'extracted') })
			: source
		if (!has_tbta_files(delivery_dir)) {
			throw new Error(`No .sqlite or .new files found in ${delivery_dir}.`)
		}

		const working_dir = join(temp_dir, 'working')
		await mkdir(working_dir)
		await copy_with_plain_names({ from: delivery_dir, to: working_dir })

		return { working_dir, cleanup }
	} catch (error) {
		await cleanup()
		throw error
	}
}

const DATED_EXPORT = /^(?<name>.+)_\d{4}-\d{2}-\d{2}\.tbta\.sqlite$/

/** `English_2026-11-19.tbta.sqlite` -> `English.sqlite`; any other filename is returned unchanged. */
export function plain_name(filename: string): string {
	const name = DATED_EXPORT.exec(filename)?.groups?.name
	return name ? `${name}.sqlite` : filename
}

async function copy_with_plain_names({ from, to }: { from: string, to: string }) {
	const entries = await readdir(from, { withFileTypes: true })
	const files = entries.filter(entry => entry.isFile()).map(entry => entry.name)

	const source_by_target = new Map<string, string>()
	for (const file of files) {
		const target = plain_name(file)
		const existing = source_by_target.get(target)
		if (existing) throw new Error(`Both ${existing} and ${file} would be staged as ${target}; remove one from the delivery.`)
		source_by_target.set(target, file)
	}

	await Promise.all([...source_by_target].map(async ([target, file]) => {
		if (target !== file) log.step(`Using ${file} as ${target}.`)
		await cp(join(from, file), join(to, target))
	}))
}

async function extract_zip({ source, extract_dir }: { source: string, extract_dir: string }): Promise<string> {
	log.step(`Extracting ${source}...`)
	new AdmZip(source).extractAllTo(extract_dir, true)
	return await resolve_extracted_root(extract_dir)
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
}

// A TBTA delivery may be nothing but .new upgrade files, which staging renames to .sqlite later.
function has_tbta_files(dir: string): boolean {
	return Array.from(new Glob('*.{sqlite,new}').scanSync(dir)).length > 0
}
