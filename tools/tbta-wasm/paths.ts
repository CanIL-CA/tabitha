import { join } from 'node:path'

export const TOOL_DIR = import.meta.dir
export const TBTA_CLONE_DIR = join(TOOL_DIR, '.tbta')
export const DOWNLOAD_DIR = join(TOOL_DIR, '.downloads')
export const ENGINE_OUTPUT_DIR = join(TOOL_DIR, '..', '..', 'apps', 'generator', 'engine')

export const TBTA_REPO_URL = 'https://github.com/CanIL-CA/tbta.git'
export const TBTA_COMMIT = '32eac9c919f8346e31ae4a605d44607cd461d412'
export const CMAKE_PRESET = 'Worker-WASM-Release'

export const ENGINE_JS = 'tbta.js'
export const ENGINE_WASM = 'tbta.wasm'
export const ONTOLOGY_DB = 'Ontology.sqlite'

// Newest Ontology backup first, as classic TBTA's updater reads it.
export const ONTOLOGY_DOWNLOADS_URL = 'https://ontology.tabitha.bible/downloads'
// The raw TBTA export of the English target database, on the bucket in tools/databases/migrations/r2_sync.ts,
// and the unmodified Ontology it was built against (3.0.9494), which the engine's schema upgrade of
// that export requires before it can be re-mapped to a newer Ontology.
const R2_RAW_URL = 'https://pub-afe6c9d3b41840dda7672f3ddbae010c.r2.dev/raw'
export const LANGUAGE = 'English'
export const LANGUAGE_DB_URL = `${R2_RAW_URL}/English_2026-07-31.tbta.sqlite`
export const BASE_ONTOLOGY_URL = `${R2_RAW_URL}/Ontology_9494_2026-06-25.tabitha.sqlite`

export const SOURCES_URL = 'https://sources.tabitha.bible'
