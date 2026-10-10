import { afterEach, describe, expect, it } from 'bun:test'
import AdmZip from 'adm-zip'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Glob } from 'bun'
import { intake } from './intake'

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
	it('passes a directory path through unchanged', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'tabitha-intake-dir-'))
		temp_dirs.push(dir)

		const result = await intake(dir)

		expect(result.working_dir).toBe(dir)
		expect(result.cleanup).toBeUndefined()
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
		expect(result.working_dir.endsWith('TBTA 6-25-26')).toBe(true)
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
