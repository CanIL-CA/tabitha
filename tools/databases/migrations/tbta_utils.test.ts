import { afterEach, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { is_newer_release, to_sources_complex } from './tbta_utils'

const temp_dirs: string[] = []
afterEach(() => {
	while (temp_dirs.length > 0) rmSync(temp_dirs.pop()!, { recursive: true, force: true })
})

describe('is_newer_release', () => {
	it('spots a newer patch, minor or major release', () => {
		expect(is_newer_release({ candidate: 'v5.2.1', pinned: 'v5.2.0' })).toBe(true)
		expect(is_newer_release({ candidate: 'v5.3.0', pinned: 'v5.2.0' })).toBe(true)
		expect(is_newer_release({ candidate: 'v6.0.0', pinned: 'v5.2.0' })).toBe(true)
	})

	it('compares numerically, not as text', () => {
		expect(is_newer_release({ candidate: 'v5.10.0', pinned: 'v5.9.0' })).toBe(true)
	})

	it('is false for the pinned release and older ones', () => {
		expect(is_newer_release({ candidate: 'v5.2.0', pinned: 'v5.2.0' })).toBe(false)
		expect(is_newer_release({ candidate: 'v5.1.0', pinned: 'v5.2.0' })).toBe(false)
	})
})

describe('to_sources_complex', () => {
	it('writes bulk-generate verses as a Sources table with semantic_encoding', () => {
		const dir = mkdtempSync(join(tmpdir(), 'tabitha-sources-complex-'))
		temp_dirs.push(dir)
		const bulk_generated = join(dir, 'bulk-generate.sqlite')
		const generated = new Database(bulk_generated)
		generated.run("CREATE TABLE Verses ('type', 'id_primary', 'id_secondary', 'id_tertiary', 'verse_text')")
		generated.run("INSERT INTO Verses VALUES ('Bible', 'Romans', 10, 2, '~\\wd ~\\tg A-1BN.....~\\lu loyal~\\z1 loyal')")
		generated.close()
		const sources_complex = join(dir, 'Sources_Complex.sqlite')

		to_sources_complex({ bulk_generated, sources_complex })

		const db = new Database(sources_complex, { readonly: true })
		const rows = db.query('SELECT * FROM Sources').all()
		db.close()
		expect(rows).toEqual([{
			type: 'Bible',
			id_primary: 'Romans',
			id_secondary: 10,
			id_tertiary: 2,
			phase_1_encoding: '',
			semantic_encoding: '~\\wd ~\\tg A-1BN.....~\\lu loyal~\\z1 loyal',
			notes: '',
		}])
	})
})
