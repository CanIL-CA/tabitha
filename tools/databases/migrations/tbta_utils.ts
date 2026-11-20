import AdmZip from 'adm-zip'
import { $ } from 'bun'
import { Database } from 'bun:sqlite'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { create_logger } from './log'

const log = create_logger('tbta_utils')

/**
 * The TBTA release whose tbta-utils the pipeline runs. Its subcommands and output formats change
 * between releases (5.2.0 renamed export-generated-cci to bulk-generate), so moving to a new release
 * is a reviewed change here, and a run stops when a newer release exists (see assert_pinned_release_is_latest).
 */
export const TBTA_RELEASE = 'v5.2.0'

const RELEASES_REPO = 'CanIL-CA/tbta-public'

type ReleaseAsset = {
	file: string
	sha256: string
	executable: string
}

// Keyed by `${process.platform}-${process.arch}`. Windows' x86 build runs on x64 Windows.
const ASSETS: Record<string, ReleaseAsset> = {
	'darwin-arm64': { file: 'TBTA-macOS-ARM64.tar.gz', sha256: '7919f3b533ac6ee91b9f9913eb80d68a7545aaf8eb9c90a9e470fac609b582f8', executable: 'tbta-utils' },
	'linux-x64': { file: 'TBTA-Linux-x86.tar.gz', sha256: '95415695e16d60f3dfd35d1972bfd8fd2cf8a0cc752cbe55958cff2912e446ad', executable: 'tbta-utils' },
	'win32-x64': { file: 'TBTA-Windows-x86.zip', sha256: 'bd08c47b76c3aa3d74add7b7da9b291207005962d4bfccae16659cc5b4689204', executable: 'TbtaUtils.exe' },
}

const CACHE_DIR = join(import.meta.dir, '../.cache/tbta')

/** Returns the path of the pinned release's tbta-utils, downloading and verifying it on first use. */
export async function tbta_utils_binary(): Promise<string> {
	const platform = `${process.platform}-${process.arch}`
	const asset = ASSETS[platform]
	if (!asset) throw new Error(`TBTA ${TBTA_RELEASE} has no tbta-utils build for "${platform}". Available: ${Object.keys(ASSETS).join(', ')}.`)

	const release_dir = join(CACHE_DIR, TBTA_RELEASE, platform)
	const executable = join(release_dir, asset.executable)
	if (existsSync(executable)) return executable

	const url = `https://github.com/${RELEASES_REPO}/releases/download/${TBTA_RELEASE}/${asset.file}`
	log.step(`Downloading TBTA ${TBTA_RELEASE} (${asset.file})...`)
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Couldn't download ${url} (${response.status}).`)
	const bytes = new Uint8Array(await response.arrayBuffer())

	const sha256 = createHash('sha256').update(bytes).digest('hex')
	if (sha256 !== asset.sha256) throw new Error(`${asset.file} from TBTA ${TBTA_RELEASE} has sha256 ${sha256}, not the pinned ${asset.sha256}. The release asset changed; check it before updating the pin.`)

	await rm(release_dir, { recursive: true, force: true })
	await mkdir(release_dir, { recursive: true })
	if (asset.file.endsWith('.zip')) {
		new AdmZip(Buffer.from(bytes)).extractAllTo(release_dir, true)
	} else {
		const archive = join(release_dir, asset.file)
		await Bun.write(archive, bytes)
		await $`tar -xzf ${archive} -C ${release_dir}`
		await rm(archive)
	}
	if (!existsSync(executable)) throw new Error(`${asset.file} from TBTA ${TBTA_RELEASE} has no ${asset.executable}.`)
	if (process.platform !== 'win32') await $`chmod +x ${executable}`

	return executable
}

/**
 * Stops the run when TBTA has released something newer than TBTA_RELEASE, so the pipeline never
 * quietly generates with an outdated engine. Can't-tell (offline, rate-limited) only warns.
 */
export async function assert_pinned_release_is_latest(): Promise<void> {
	let latest: string | undefined
	try {
		const response = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'tabitha-migrations' } })
		if (response.ok) latest = (await response.json() as { tag_name?: string }).tag_name
	} catch {
		// handled below
	}

	if (!latest) {
		log.warn(`Couldn't check for a TBTA release newer than ${TBTA_RELEASE}; continuing with it.`)
		return
	}
	if (is_newer_release({ candidate: latest, pinned: TBTA_RELEASE })) {
		throw new Error(`TBTA ${latest} is out, but the pipeline is pinned to ${TBTA_RELEASE}. Update TBTA_RELEASE and the asset checksums in migrations/tbta_utils.ts, and check tbta-utils' subcommands and output formats for changes.`)
	}
}

/** Compares release tags like `v5.2.0` by their numeric parts. */
export function is_newer_release({ candidate, pinned }: { candidate: string, pinned: string }): boolean {
	const parts = (tag: string) => tag.replace(/^v/, '').split(/[.-]/).map(part => Number.parseInt(part, 10)).filter(part => !Number.isNaN(part))
	const [candidate_parts, pinned_parts] = [parts(candidate), parts(pinned)]
	for (let index = 0; index < Math.max(candidate_parts.length, pinned_parts.length); index++) {
		const difference = (candidate_parts[index] ?? 0) - (pinned_parts[index] ?? 0)
		if (difference !== 0) return difference > 0
	}
	return false
}

/**
 * Writes bulk-generate's output (a Verses table with verse_text) as a Sources_Complex database: the
 * Sources table and semantic_encoding column that the Ontology examples rebuild reads.
 */
export function to_sources_complex({ bulk_generated, sources_complex }: { bulk_generated: string, sources_complex: string }): void {
	const db = new Database(sources_complex, { create: true })
	try {
		db.run('ATTACH DATABASE ? AS generated', [bulk_generated])
		db.run('CREATE TABLE Sources (type, id_primary, id_secondary, id_tertiary, phase_1_encoding, semantic_encoding, notes)')
		db.run("INSERT INTO Sources SELECT type, id_primary, id_secondary, id_tertiary, '', verse_text, '' FROM generated.Verses")
		db.run('DETACH DATABASE generated')
	} finally {
		db.close()
	}
}
