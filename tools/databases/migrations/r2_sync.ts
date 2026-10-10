// Syncs tools/databases/raw/ and tools/databases/snapshots/ with the db-migration-data R2 bucket,
// replacing the Git LFS tracking those directories used to have. manifest.json (committed to git,
// alongside this script) is the source of truth for which dated files currently exist -- R2's public
// r2.dev URL serves objects by exact key but has no public list-objects endpoint, so `pull` needs
// something to enumerate against without an authenticated `wrangler r2 object list` call.
//
// Reads are anonymous HTTPS GETs against the bucket's public r2.dev URL (no Cloudflare credentials
// needed, since the bucket and its contents are already effectively public via this public monorepo's
// prior Git LFS tracking). Writes (`push`, `prune`) shell out to `wrangler`, authenticated the same
// way as migrations/backup/index.ts (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).

import { $, Glob } from 'bun'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { create_logger } from './log'

const log = create_logger('R2 Sync')

const BUCKET = 'db-migration-data'
const PUBLIC_BASE_URL = 'https://pub-afe6c9d3b41840dda7672f3ddbae010c.r2.dev'
const DIRS = ['raw', 'snapshots'] as const
type Dir = typeof DIRS[number]

const MANIFEST_PATH = join(import.meta.dir, '../manifest.json')
type Manifest = Record<Dir, string[]>

function read_manifest(): Manifest {
	if (!existsSync(MANIFEST_PATH)) return { raw: [], snapshots: [] }
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
}

function write_manifest(manifest: Manifest) {
	for (const dir of DIRS) manifest[dir].sort()
	writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, '\t') + '\n')
}

function local_dir(dir: Dir): string {
	return join(import.meta.dir, '..', dir)
}

/** Downloads every manifest-listed file for `dirs` that isn't already present locally. */
async function pull(dirs: Dir[]) {
	const manifest = read_manifest()
	let fetched = 0

	for (const dir of dirs) {
		for (const filename of manifest[dir]) {
			const dest = join(local_dir(dir), filename)
			if (existsSync(dest)) continue

			log.step(`Fetching ${dir}/${filename}...`)
			const res = await fetch(`${PUBLIC_BASE_URL}/${dir}/${filename}`)
			if (!res.ok) throw new Error(`Failed to fetch ${dir}/${filename}: ${res.status} ${res.statusText}`)
			// Buffering fully in memory (files here top out around ~90MB) rather than passing the
			// Response directly to Bun.write, which hung indefinitely (near-zero throughput, high
			// CPU) on a large streamed body under Bun 1.4.0.
			await Bun.write(dest, await res.arrayBuffer())
			fetched++
		}
	}

	log.success(fetched > 0 ? `Fetched ${fetched} file(s) from R2.` : 'All manifest files already present locally.')
}

/** Uploads any local file not yet in the manifest (dated files are immutable once created, so already-listed ones are never re-uploaded). */
async function push(dirs: Dir[]) {
	const manifest = read_manifest()
	let uploaded = 0

	for (const dir of dirs) {
		// Databases and dumps only -- never a SQLite -wal/-shm sidecar left behind by opening a file.
		const local_files = Array.from(new Glob('*.{sqlite,sql}').scanSync(local_dir(dir))).sort()
		for (const filename of local_files) {
			if (manifest[dir].includes(filename)) continue

			log.step(`Uploading ${dir}/${filename} to R2...`)
			await $`wrangler r2 object put ${BUCKET}/${dir}/${filename} --file ${join(local_dir(dir), filename)} --remote`.quiet()
			manifest[dir].push(filename)
			uploaded++
		}
	}

	write_manifest(manifest)
	log.success(uploaded > 0 ? `Uploaded ${uploaded} new file(s) to R2 and updated manifest.json.` : 'Nothing new to upload; manifest.json already up to date.')
}

const DATED_FILENAME = /^(.+)_(\d{4}-\d{2}-\d{2})\.(.+)$/

/** Deletes stale dated versions from R2, keeping the latest `keep` per {prefix, extension} family. Undated files (e.g. Auth.tabitha.sqlite) are never pruned. */
async function prune({ dirs, keep }: {
	dirs: Dir[]
	keep: number
}) {
	const manifest = read_manifest()

	for (const dir of dirs) {
		const families = new Map<string, { date: string, filename: string }[]>()
		for (const filename of manifest[dir]) {
			const match = filename.match(DATED_FILENAME)
			if (!match) continue // undated -- never pruned

			const [, prefix, date, ext] = match
			const key = `${prefix}.${ext}`
			const versions = families.get(key) ?? []
			versions.push({ date, filename })
			families.set(key, versions)
		}

		for (const versions of families.values()) {
			versions.sort((a, b) => b.date.localeCompare(a.date)) // newest first
			for (const { filename } of versions.slice(keep)) {
				log.step(`Deleting stale ${dir}/${filename} from R2 (keeping latest ${keep})...`)
				await $`wrangler r2 object delete ${BUCKET}/${dir}/${filename} --remote`.quiet()
				manifest[dir] = manifest[dir].filter(f => f !== filename)
			}
		}
	}

	write_manifest(manifest)
	log.summary()
}

function parse_dirs(arg: string | undefined): Dir[] {
	if (!arg || arg === 'all') return [...DIRS]
	if (arg === 'raw' || arg === 'snapshots') return [arg]
	throw new Error(`Unknown scope "${arg}". Expected "raw", "snapshots", or "all".`)
}

if (import.meta.main) {
	const [, , command, arg] = Bun.argv
	const USAGE = 'Usage: bun migrations/r2_sync.ts <pull|push|prune> [raw|snapshots|all] [keep_count]'

	if (command === 'pull') await pull(parse_dirs(arg))
	else if (command === 'push') await push(parse_dirs(arg))
	else if (command === 'prune') await prune({ dirs: parse_dirs(arg), keep: Number(Bun.argv[4]) || 2 })
	else throw new Error(USAGE)
}
