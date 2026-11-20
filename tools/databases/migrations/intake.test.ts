import { afterEach, describe, expect, it } from 'bun:test'
import AdmZip from 'adm-zip'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Glob } from 'bun'
import { intake, plain_name } from './intake'

describe('plain_name', () => {
	it('drops the date and .tbta from a dated TBTA export', () => {
		expect(plain_name('English_2026-11-19.tbta.sqlite')).toBe('English.sqlite')
	})

	it('keeps underscores that are part of the database name', () => {
		expect(plain_name('Sources_Complex_2026-11-19.tbta.sqlite')).toBe('Sources_Complex.sqlite')
	})

	it('leaves plain names, .new upgrades and TaBiThA outputs alone', () => {
		expect(plain_name('Bible.sqlite')).toBe('Bible.sqlite')
		expect(plain_name('Ontology.new')).toBe('Ontology.new')
		expect(plain_name('Targets_2026-07-31.tabitha.sqlite')).toBe('Targets_2026-07-31.tabitha.sqlite')
	})
})

const temp_dirs: string[] = []
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()!()
	while (temp_dirs.length > 0) rmSync(temp_dirs.pop()!, { recursive: true, force: true })
})

function make_zip({ entries, wrap_in_folder }: {
	entries: Record<string, string>
	wrap_in_folder?: string
}): string {
	const source_dir = mkdtempSync(join(tmpdir(), 'tabitha-intake-src-'))
	temp_dirs.push(source_dir)

	const zip = new AdmZip()
	for (const [name, content] of Object.entries(entries)) {
		const entry_name = wrap_in_folder ? `${wrap_in_folder}/${name}` : name
		zip.addFile(entry_name, Buffer.from(content))
	}

	const zip_path = join(source_dir, 'bundle.zip')
	zip.writeZip(zip_path)
	return zip_path
}

describe('intake', () => {
	it('copies a directory into a separate working directory', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'tabitha-intake-dir-'))
		temp_dirs.push(dir)
		await Bun.write(join(dir, 'Bible.sqlite'), 'bible-content')

		const result = await intake(dir)
		cleanups.push(result.cleanup)

		expect(result.working_dir).not.toBe(dir)
		expect(await Bun.file(join(result.working_dir, 'Bible.sqlite')).text()).toBe('bible-content')
	})

	it('gives dated TBTA exports their plain names and leaves the delivery untouched', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'tabitha-intake-dir-'))
		temp_dirs.push(dir)
		await Bun.write(join(dir, 'English_2026-11-19.tbta.sqlite'), 'english-content')
		await Bun.write(join(dir, 'Bible.sqlite'), 'bible-content')

		const result = await intake(dir)
		cleanups.push(result.cleanup)

		const working_files = Array.from(new Glob('*.sqlite').scanSync(result.working_dir)).sort()
		expect(working_files).toEqual(['Bible.sqlite', 'English.sqlite'])
		expect(await Bun.file(join(result.working_dir, 'English.sqlite')).text()).toBe('english-content')
		const delivery_files = Array.from(new Glob('*.sqlite').scanSync(dir)).sort()
		expect(delivery_files).toEqual(['Bible.sqlite', 'English_2026-11-19.tbta.sqlite'])
	})

	it('gives dated exports inside a zip their plain names', async () => {
		const zip_path = make_zip({ entries: { 'Bible_2026-11-17.tbta.sqlite': 'bible-content' } })

		const result = await intake(zip_path)
		cleanups.push(result.cleanup)

		expect(await Bun.file(join(result.working_dir, 'Bible.sqlite')).text()).toBe('bible-content')
	})

	it('throws when a delivery holds the same database under a plain and a dated name', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'tabitha-intake-dir-'))
		temp_dirs.push(dir)
		await Bun.write(join(dir, 'English.sqlite'), 'one')
		await Bun.write(join(dir, 'English_2026-11-19.tbta.sqlite'), 'two')

		await expect(intake(dir)).rejects.toThrow(/would be staged as English\.sqlite/)
	})

	it('throws when a directory has no .sqlite or .new files', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'tabitha-intake-dir-'))
		temp_dirs.push(dir)
		await Bun.write(join(dir, 'readme.txt'), 'not a database')

		await expect(intake(dir)).rejects.toThrow(/No \.sqlite or \.new files found/)
	})

	it('extracts a flat zip (files directly at the root) into a working directory', async () => {
		const zip_path = make_zip({ entries: { 'Bible.sqlite': 'bible-content', 'English.sqlite': 'english-content' } })

		const result = await intake(zip_path)
		if (result.cleanup) cleanups.push(result.cleanup)

		const files = Array.from(new Glob('*.sqlite').scanSync(result.working_dir)).sort()
		expect(files).toEqual(['Bible.sqlite', 'English.sqlite'])
	})

	it('extracts a zip wrapping its contents in a single top-level folder', async () => {
		const zip_path = make_zip({ entries: { 'Bible.sqlite': 'bible-content' }, wrap_in_folder: 'TBTA 6-25-26' })

		const result = await intake(zip_path)
		if (result.cleanup) cleanups.push(result.cleanup)

		const files = Array.from(new Glob('*.sqlite').scanSync(result.working_dir))
		expect(files).toEqual(['Bible.sqlite'])
	})

	it('accepts a zip containing only .new upgrade files, e.g. an ontology-only delivery', async () => {
		const zip_path = make_zip({ entries: { 'Ontology.new': 'ontology-content' } })

		const result = await intake(zip_path)
		if (result.cleanup) cleanups.push(result.cleanup)

		const files = Array.from(new Glob('*.new').scanSync(result.working_dir))
		expect(files).toEqual(['Ontology.new'])
	})

	it('throws when the extracted zip has no .sqlite or .new files at the root or in a single wrapping folder', async () => {
		const zip_path = make_zip({ entries: { 'readme.txt': 'not a database' } })

		await expect(intake(zip_path)).rejects.toThrow(/No \.sqlite or \.new files found/)
	})

	it('cleanup removes the extracted temp directory', async () => {
		const zip_path = make_zip({ entries: { 'Bible.sqlite': 'bible-content' } })

		const result = await intake(zip_path)
		expect(result.cleanup).toBeDefined()
		expect(await Bun.file(join(result.working_dir, 'Bible.sqlite')).exists()).toBe(true)

		await result.cleanup!()

		expect(await Bun.file(join(result.working_dir, 'Bible.sqlite')).exists()).toBe(false)
	})

	it('writes out the real file content, not just the file names', async () => {
		const zip_path = make_zip({ entries: { 'Bible.sqlite': 'bible-content-xyz' } })

		const result = await intake(zip_path)
		if (result.cleanup) cleanups.push(result.cleanup)

		const text = await Bun.file(join(result.working_dir, 'Bible.sqlite')).text()
		expect(text).toBe('bible-content-xyz')
	})
})
