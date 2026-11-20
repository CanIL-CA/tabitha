import { afterEach, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { backup_url, read_ontology_version } from './live_ontology_backup'

const temp_dirs: string[] = []
afterEach(() => {
	while (temp_dirs.length > 0) rmSync(temp_dirs.pop()!, { recursive: true, force: true })
})

function make_language_db({ version }: { version?: string }): string {
	const dir = mkdtempSync(join(tmpdir(), 'tabitha-ontology-version-'))
	temp_dirs.push(dir)
	const db_path = join(dir, 'English.sqlite')
	const db = new Database(db_path)
	db.run('CREATE TABLE OntologyVersion (ID INTEGER, Version TEXT)')
	if (version) db.run('INSERT INTO OntologyVersion VALUES (1, ?)', [version])
	db.close()
	return db_path
}

describe('backup_url', () => {
	it("names the backup the way TBTA's updater downloads it", () => {
		expect(backup_url({ version: '3.0.9606' })).toBe('https://db-backups.tabitha.bible/Ontology_3-0-9606.tabitha.sqlite')
	})
})

describe('read_ontology_version', () => {
	it('reads the Ontology version a language database is mapped to', () => {
		const db_path = make_language_db({ version: '3.0.9606' })

		expect(read_ontology_version({ db_path })).toBe('3.0.9606')
	})

	it('throws when the database has no version stamp', () => {
		const db_path = make_language_db({})

		expect(() => read_ontology_version({ db_path })).toThrow(/no OntologyVersion row/)
	})
})
