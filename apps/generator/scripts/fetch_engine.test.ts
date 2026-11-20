// Covers the downloads the build has to refuse. A successful fetch needs the real engine, so the
// build itself is that check: it generates Genesis 1:1 before it accepts what it downloaded.
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
import { LANGUAGE, ONTOLOGY_VERSION } from './engine_source'
import { fetch_engine } from './fetch_engine'

const WAL = 2
const OLDER_VERSION = '3.0.9494'

function ontology_db({ version }: { version: string }) {
	const db = new Database(':memory:')
	db.run('CREATE TABLE Version (version TEXT)')
	db.run('INSERT INTO Version VALUES (?)', [version])
	return new Uint8Array(db.serialize())
}

function language_db({ mapped_to }: { mapped_to: string }) {
	const db = new Database(':memory:')
	db.run('CREATE TABLE OntologyVersion (Version TEXT)')
	db.run('INSERT INTO OntologyVersion VALUES (?)', [mapped_to])
	return new Uint8Array(db.serialize())
}

function in_wal_mode({ bytes }: { bytes: Uint8Array<ArrayBuffer> }) {
	const copy = bytes.slice()
	copy[18] = WAL
	copy[19] = WAL
	return copy
}

async function archive_of({ names }: { names: string[] }) {
	return new Bun.Archive(Object.fromEntries(names.map(name => [name, 'placeholder'])), { compress: 'gzip' }).bytes()
}

let server: ReturnType<typeof Bun.serve> | undefined

// Stands in for the release host and the data bucket: a real HTTP server holding the given files.
function source_serving({ files }: { files: Record<string, Uint8Array<ArrayBuffer>> }) {
	server = Bun.serve({
		port: 0,
		fetch: request => {
			const bytes = files[new URL(request.url).pathname]
			return bytes ? new Response(bytes) : new Response('Not found', { status: 404 })
		},
	})
	return { engine_archive_url: `${server.url.origin}/engine.tar.gz`, data_url: `${server.url.origin}/data` }
}

afterEach(() => server?.stop(true))

describe('fetch_engine', () => {
	it('refuses a database in WAL mode', async () => {
		const source = source_serving({ files: {
			'/engine.tar.gz': await archive_of({ names: ['BrowserTest.js', 'BrowserTest.wasm'] }),
			'/data/Ontology.sqlite': in_wal_mode({ bytes: ontology_db({ version: ONTOLOGY_VERSION }) }),
			[`/data/${LANGUAGE}.sqlite`]: language_db({ mapped_to: ONTOLOGY_VERSION }),
		} })

		await expect(fetch_engine({ source })).rejects.toThrow('Ontology.sqlite is in WAL mode')
	})

	it('refuses an Ontology that is not the pinned version', async () => {
		const source = source_serving({ files: {
			'/engine.tar.gz': await archive_of({ names: ['BrowserTest.js', 'BrowserTest.wasm'] }),
			'/data/Ontology.sqlite': ontology_db({ version: OLDER_VERSION }),
			[`/data/${LANGUAGE}.sqlite`]: language_db({ mapped_to: ONTOLOGY_VERSION }),
		} })

		await expect(fetch_engine({ source })).rejects.toThrow(`Ontology.sqlite is version ${OLDER_VERSION}`)
	})

	it('refuses a language database mapped to another Ontology version', async () => {
		const source = source_serving({ files: {
			'/engine.tar.gz': await archive_of({ names: ['BrowserTest.js', 'BrowserTest.wasm'] }),
			'/data/Ontology.sqlite': ontology_db({ version: ONTOLOGY_VERSION }),
			[`/data/${LANGUAGE}.sqlite`]: language_db({ mapped_to: OLDER_VERSION }),
		} })

		await expect(fetch_engine({ source })).rejects.toThrow(`${LANGUAGE}.sqlite is mapped to Ontology ${OLDER_VERSION}`)
	})

	it('refuses an archive without the engine in it', async () => {
		const source = source_serving({ files: {
			'/engine.tar.gz': await archive_of({ names: ['README.txt'] }),
			'/data/Ontology.sqlite': ontology_db({ version: ONTOLOGY_VERSION }),
			[`/data/${LANGUAGE}.sqlite`]: language_db({ mapped_to: ONTOLOGY_VERSION }),
		} })

		await expect(fetch_engine({ source })).rejects.toThrow('The engine archive has no BrowserTest.js')
	})

	it('says which download is missing', async () => {
		const source = source_serving({ files: {
			'/engine.tar.gz': await archive_of({ names: ['BrowserTest.js', 'BrowserTest.wasm'] }),
			'/data/Ontology.sqlite': ontology_db({ version: ONTOLOGY_VERSION }),
		} })

		await expect(fetch_engine({ source })).rejects.toThrow(`/data/${LANGUAGE}.sqlite returned 404`)
	})
})
