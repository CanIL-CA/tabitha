// Prepares the databases the generation engine reads, next to the engine in apps/generator/engine/.
// Run `bun run engine:build` first.
//
// 1. Download the English target database (a raw TBTA export), the Ontology it was built against,
//    and the newest Ontology backup.
// 2. Run the engine on English + its own Ontology: it upgrades the export's schema (to 4.25), which
//    only works against the exact Ontology version the export is mapped to.
// 3. Run the engine on the upgraded English + the newest Ontology: it re-maps English to that version.
//    The engine would do either step on its first load, so doing both here keeps them out of every
//    cold start.
// 4. Drop the tables generation doesn't read (about 100 MB of the 116), then generate one verse
//    from the trimmed files as a smoke test.
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generate_verse, load_engine, read_database, type CreateEngine } from '@tabitha/generator/engine'
import { BASE_ONTOLOGY_URL, DOWNLOAD_DIR, ENGINE_JS, ENGINE_OUTPUT_DIR, ENGINE_WASM, LANGUAGE, LANGUAGE_DB_URL, ONTOLOGY_DB, ONTOLOGY_DOWNLOADS_URL, SOURCES_URL } from './paths'

const USER_AGENT = 'tabitha-tbta-wasm/0.1 (+https://github.com/CanIL-CA/tabitha)'
const LANGUAGE_DB = `${LANGUAGE}.sqlite`
const EMPTY_VERSE = { audience: 1, book: 1, chapter: 1, verse: 1, segment: 'last', encoding: '', previous_encoding: '' } as const

// Generation never reads these: Ontology examples for people browsing concepts, and the
// target text TBTA generated earlier.
const ONTOLOGY_TABLES_TO_DROP = (name: string) => name === 'Exhaustive_Examples'
const LANGUAGE_TABLES_TO_DROP = (name: string) => name.startsWith('Target_')

async function newest_ontology_url() {
	const response = await fetch(ONTOLOGY_DOWNLOADS_URL, { headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT } })
	if (!response.ok) throw new Error(`${ONTOLOGY_DOWNLOADS_URL} returned ${response.status}`)
	const [newest] = await response.json() as { version: string, url: string }[]
	return newest.url
}

async function download({ url }: { url: string }) {
	mkdirSync(DOWNLOAD_DIR, { recursive: true })
	const path = join(DOWNLOAD_DIR, new URL(url).pathname.split('/').pop() as string)
	if (!existsSync(path)) {
		console.log(`Downloading ${url}`)
		const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
		if (!response.ok) throw new Error(`${url} returned ${response.status}`)
		await Bun.write(path, response)
	}
	return readFileSync(path)
}

// An in-memory database can't use WAL, and the Ontology backups are WAL files: bytes 18-19 of the
// SQLite header hold the journal mode (2 = WAL), so set them back to 1 (rollback journal).
function without_wal({ bytes }: { bytes: Uint8Array }) {
	bytes[18] = 1
	bytes[19] = 1
	return bytes
}

function trimmed({ bytes, should_drop }: { bytes: Uint8Array, should_drop: (table_name: string) => boolean }) {
	const db = Database.deserialize(without_wal({ bytes }))
	const tables = db.query<{ name: string }, []>(`SELECT name FROM sqlite_master WHERE type = 'table'`).all()
	for (const table of tables.filter(table => should_drop(table.name))) db.run(`DROP TABLE [${table.name}]`)
	db.run('VACUUM')
	const result = db.serialize()
	db.close(true)
	return result
}

function mapped_ontology_version({ bytes }: { bytes: Uint8Array }) {
	const db = Database.deserialize(without_wal({ bytes: bytes.slice() }))
	const { Version } = db.query<{ Version: string }, []>('SELECT Version FROM OntologyVersion').get() as { Version: string }
	db.close(true)
	return Version
}

async function start_engine({ ontology, language }: { ontology: Uint8Array, language: Uint8Array }) {
	const { default: create_engine } = await import(join(ENGINE_OUTPUT_DIR, ENGINE_JS)) as { default: CreateEngine }
	const wasm_module = new WebAssembly.Module(readFileSync(join(ENGINE_OUTPUT_DIR, ENGINE_WASM)))
	return load_engine({
		create_engine,
		wasm_module,
		databases: { [ONTOLOGY_DB]: ontology, [LANGUAGE_DB]: language },
		log: line => console.log(`  engine: ${line}`),
	})
}

// The engine upgrades or re-maps the language database as it opens it, on the first generation.
async function language_db_after_engine_load({ ontology, language }: { ontology: Uint8Array, language: Uint8Array }) {
	const engine = await start_engine({ ontology, language })
	generate_verse({ engine, language: LANGUAGE, ...EMPTY_VERSE })
	return read_database({ engine, name: LANGUAGE_DB })
}

async function smoke_test({ ontology, language }: { ontology: Uint8Array, language: Uint8Array }) {
	const response = await fetch(`${SOURCES_URL}/Bible/Genesis/1/1`, { headers: { 'User-Agent': USER_AGENT } })
	const { semantic_encoding } = await response.json() as { semantic_encoding: string }
	const engine = await start_engine({ ontology, language })
	return generate_verse({ engine, language: LANGUAGE, ...EMPTY_VERSE, encoding: semantic_encoding })
}

if (!existsSync(join(ENGINE_OUTPUT_DIR, ENGINE_WASM))) throw new Error('No engine found. Run `bun run engine:build` first.')

const raw_language = without_wal({ bytes: await download({ url: LANGUAGE_DB_URL }) })
const base_ontology = without_wal({ bytes: await download({ url: BASE_ONTOLOGY_URL }) })
const newest_ontology = without_wal({ bytes: await download({ url: await newest_ontology_url() }) })
const target_version = mapped_ontology_version({ bytes: newest_ontology })

console.log(`Upgrading ${LANGUAGE_DB} against Ontology ${mapped_ontology_version({ bytes: base_ontology })}`)
const upgraded_language = await language_db_after_engine_load({ ontology: base_ontology, language: raw_language })
console.log(`Re-mapping ${LANGUAGE_DB} to Ontology ${target_version}`)
const remapped_language = await language_db_after_engine_load({ ontology: newest_ontology, language: upgraded_language })

const language_version = mapped_ontology_version({ bytes: remapped_language })
if (language_version !== target_version) throw new Error(`${LANGUAGE_DB} is mapped to Ontology ${language_version}, not ${target_version}`)

const ontology = trimmed({ bytes: newest_ontology, should_drop: ONTOLOGY_TABLES_TO_DROP })
const language = trimmed({ bytes: remapped_language, should_drop: LANGUAGE_TABLES_TO_DROP })
const sample = await smoke_test({ ontology, language })
if (sample === '') throw new Error('The trimmed databases generated no text for Genesis 1:1')

writeFileSync(join(ENGINE_OUTPUT_DIR, ONTOLOGY_DB), ontology)
writeFileSync(join(ENGINE_OUTPUT_DIR, LANGUAGE_DB), language)
console.log(`Wrote ${ONTOLOGY_DB} (${Math.round(ontology.length / 1024)} KB) and ${LANGUAGE_DB} (${Math.round(language.length / 1024)} KB), mapped to Ontology ${target_version}`)
console.log(`Genesis 1:1: ${sample}`)
