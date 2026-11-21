// Downloads the engine and the databases named in engine_source.ts into engine/, checks that they
// belong together and that a verse generates, and writes gzipped copies for browsers. Part of
// `bun run build`, so the deploy pipeline runs it; needs nothing but Bun and network access.
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { generate_verse, load_engine, type CreateEngine } from '@tabitha/generator/engine'
import { DATA_URL, ENGINE_ARCHIVE_URL, LANGUAGE, LANGUAGE_FILE, ONTOLOGY_VERSION } from './engine_source'

const ENGINE_DIR = join(import.meta.dir, '..', 'engine')
const ENGINE_JS = 'tbta.js'
const ENGINE_WASM = 'tbta.wasm'
const ONTOLOGY_DB = 'Ontology.sqlite'
const LANGUAGE_DB = `${LANGUAGE}.sqlite`
const NAME_IN_ARCHIVE = { [ENGINE_JS]: 'BrowserTest.js', [ENGINE_WASM]: 'BrowserTest.wasm' }
// Cloudflare doesn't compress .wasm or .sqlite responses, so browsers download gzipped copies,
// about a fifth of the size, and decompress them themselves.
const GZIPPED_FOR_BROWSERS = [ENGINE_WASM, ONTOLOGY_DB, LANGUAGE_DB]
// Records what engine/ was fetched from, so an unchanged build doesn't download it all again.
const FETCHED_FROM_FILE = join(ENGINE_DIR, 'fetched_from.json')
const SAMPLE_VERSE = { audience: 1, book: 1, chapter: 1, verse: 1, segment: 'last', previous_encoding: '' } as const
const ROLLBACK_JOURNAL = 1

type EngineSource = { engine_archive_url: string, data_url: string, language_file: string }

async function download({ url }: { url: string }) {
	console.info(`Downloading ${url}`)
	const response = await fetch(url)
	if (!response.ok) throw new Error(`${url} returned ${response.status}. Check the release and Ontology version in engine_source.ts.`)
	return response.bytes()
}

async function engine_files({ archive }: { archive: Uint8Array }) {
	const entries = await new Bun.Archive(archive).files()
	const by_name = new Map([...entries].map(([path, file]) => [basename(path), file]))
	const files: Record<string, Uint8Array<ArrayBuffer>> = {}
	for (const [name, name_in_archive] of Object.entries(NAME_IN_ARCHIVE)) {
		const file = by_name.get(name_in_archive)
		if (!file) throw new Error(`The engine archive has no ${name_in_archive}`)
		files[name] = await file.bytes()
	}
	return files
}

// Bytes 18-19 of a SQLite header hold the journal mode. The engine opens its databases from an
// in-memory filesystem, where WAL (2) can't work.
function uses_rollback_journal({ bytes }: { bytes: Uint8Array }) {
	return bytes[18] === ROLLBACK_JOURNAL && bytes[19] === ROLLBACK_JOURNAL
}

function version_in({ bytes, sql }: { bytes: Uint8Array, sql: string }) {
	const db = Database.deserialize(bytes)
	const row = db.query<{ version: string }, []>(sql).get()
	db.close(true)
	return row?.version
}

function mismatches({ ontology, language }: { ontology: Uint8Array, language: Uint8Array }) {
	const problems: string[] = []
	for (const [name, bytes] of [[ONTOLOGY_DB, ontology], [LANGUAGE_DB, language]] as const) {
		if (!uses_rollback_journal({ bytes })) problems.push(`${name} is in WAL mode, which the engine can't open`)
	}
	if (problems.length > 0) return problems

	const ontology_version = version_in({ bytes: ontology, sql: 'SELECT version FROM Version' })
	const mapped_version = version_in({ bytes: language, sql: 'SELECT Version AS version FROM OntologyVersion' })
	if (ontology_version !== ONTOLOGY_VERSION) problems.push(`${ONTOLOGY_DB} is version ${ontology_version}, not ${ONTOLOGY_VERSION}`)
	if (mapped_version !== ONTOLOGY_VERSION) problems.push(`${LANGUAGE_DB} is mapped to Ontology ${mapped_version}, not ${ONTOLOGY_VERSION}`)
	return problems
}

async function sample_text({ ontology, language }: { ontology: Uint8Array, language: Uint8Array }) {
	const { default: create_engine } = await import(join(ENGINE_DIR, ENGINE_JS)) as { default: CreateEngine }
	const log: string[] = []
	const engine = await load_engine({
		create_engine,
		wasm_module: new WebAssembly.Module(readFileSync(join(ENGINE_DIR, ENGINE_WASM))),
		// The engine may write to its databases as it opens them, so it gets copies.
		databases: { [ONTOLOGY_DB]: ontology.slice(), [LANGUAGE_DB]: language.slice() },
		log: line => log.push(line),
	})
	const encoding = readFileSync(join(import.meta.dir, 'genesis_1_1.encoding.txt'), 'utf8').trim()
	const text = generate_verse({ engine, language: LANGUAGE, ...SAMPLE_VERSE, encoding })
	return { text, log }
}

function already_fetched({ source }: { source: EngineSource }) {
	if (!existsSync(FETCHED_FROM_FILE)) return false
	return readFileSync(FETCHED_FROM_FILE, 'utf8') === JSON.stringify(source)
}

export async function fetch_engine({ source }: { source: EngineSource }) {
	if (already_fetched({ source })) {
		console.info('engine/ is up to date')
		return
	}

	const [archive, ontology, language] = await Promise.all([
		download({ url: source.engine_archive_url }),
		download({ url: `${source.data_url}/${ONTOLOGY_DB}` }),
		download({ url: `${source.data_url}/${source.language_file}` }),
	])

	const problems = mismatches({ ontology, language })
	if (problems.length > 0) throw new Error(`The downloaded databases can't be used:\n  ${problems.join('\n  ')}`)

	const files: Record<string, Uint8Array<ArrayBuffer>> = { ...await engine_files({ archive }), [ONTOLOGY_DB]: ontology, [LANGUAGE_DB]: language }
	mkdirSync(ENGINE_DIR, { recursive: true })
	rmSync(FETCHED_FROM_FILE, { force: true })
	for (const [name, bytes] of Object.entries(files)) writeFileSync(join(ENGINE_DIR, name), bytes)
	for (const name of GZIPPED_FOR_BROWSERS) writeFileSync(join(ENGINE_DIR, `${name}.gz`), Bun.gzipSync(files[name], { level: 9 }))

	const { text, log } = await sample_text({ ontology, language })
	// The engine answers '.?' when it can't work with its databases, and exits normally.
	if (!text || text === '.?') throw new Error(`The engine generated ${JSON.stringify(text)} for Genesis 1:1. Its log:\n  ${log.join('\n  ')}`)
	console.info(`Genesis 1:1: ${text}`)

	writeFileSync(FETCHED_FROM_FILE, JSON.stringify(source))
}

if (import.meta.main) await fetch_engine({ source: { engine_archive_url: ENGINE_ARCHIVE_URL, data_url: DATA_URL, language_file: LANGUAGE_FILE } })
