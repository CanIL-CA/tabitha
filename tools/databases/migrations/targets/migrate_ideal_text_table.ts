import type Database from 'bun:sqlite'
import { create_logger } from '../log'

const log = create_logger('Targets migration')
import { Glob } from 'bun'
import OfficeParser, { type OfficeContentNode } from 'officeparser'
import { join, basename, extname } from 'path'

export async function migrate_ideal_text_table({ project, targets_db, dir }: {
	project: string
	targets_db: Database
	dir: string
}) {
	create_tabitha_table({ targets_db, project })

	const data = await get_ideal_texts({ project, texts_dir: dir })
	load_data({ targets_db, project, data })
}

function create_tabitha_table({ targets_db, project }: {
	targets_db: Database
	project: string
}) {
	log.step(`Creating the "Ideal_Text" table in ${targets_db.filename} if it does not already exist...`)

	targets_db.run(`
		CREATE TABLE IF NOT EXISTS Ideal_Text (
			project		TEXT,
			book		TEXT,
			chapter		INTEGER,
			verse		INTEGER,
			audience	TEXT,
			ideal_text		TEXT
		)
	`)

	// Only this project's rows are being replaced this run -- other projects' rows (left untouched
	// since their raw input didn't change) must survive when targets_db was copied forward from a
	// prior run's output.
	targets_db.run('DELETE FROM Ideal_Text WHERE project = ?', [project])
}

function load_data({ targets_db, project, data }: {
	targets_db: Database
	project: string
	data: IdealTextData[]
}) {
	log.step(`Loading ${data.length} verses for ${project} into the "Ideal_Text" table...`)

	data.forEach(({ book, chapter, verse, audience, text }, index) => {
		targets_db.run(`
			INSERT INTO Ideal_Text (project, book, chapter, verse, audience, ideal_text)
			VALUES (?, ?, ?, ?, ?, ?)
		`, [project, book, chapter, verse, audience, text])

		log.progress(`${book} ${chapter}:${verse}`, index + 1, data.length)
	})

	log.finish_progress()
}

// extract verse text from the documents

type IdealTextData = {
	project: string
	book: string
	chapter: number
	verse: number
	audience: string
	text: string
}

type VerseTextData = {
	chapter: number
	verse: number
	text: string
}

const default_audiences: Record<string, string> = {
	'English': 'Unchurched Adults',
	'Indonesian': 'Unchurched Adults',
	'Swahili': 'All Helps',
	'Tagalog': 'Unchurched Adults',
}

const title_tags: Record<string, string> = {
	'English': 'Title:',
	'Indonesian': 'Judul:',
	'Swahili': 'Kichwa:',
	'Tagalog': 'Pamagat:',
}

async function get_ideal_texts({ project, texts_dir }: {
	project: string
	texts_dir: string
}): Promise<IdealTextData[]> {
	const files = Array.from(new Glob(`${project}_*.{docx,sfm,SFM}`).scanSync(texts_dir))

	const parser_map = new Map([
		['.docx', parse_docx],
		['.sfm', parse_sfm],
	])

	const all_texts: IdealTextData[] = []

	for (const project_file of files) {
		const extension = extname(project_file)
		const base_name = basename(project_file, extension)
		const [, book, audience] = base_name.split('_')
		const parser_input = join(texts_dir, project_file)

		const text_data = await parser_map.get(extension.toLowerCase())?.(parser_input) ?? []

		all_texts.push(...text_data.map(t => ({
			project,
			book,
			chapter: t.chapter,
			verse: t.verse,
			audience: audience || default_audiences[project] || '',
			text: t.text.replace('Title:', title_tags[project] || 'Title:'),
		})))
	}

	return all_texts
}

async function parse_docx(input_file: string): Promise<VerseTextData[]> {
	const ast = await OfficeParser.parseOffice(input_file)
	const verses: VerseTextData[] = []

	const tables = ast.content.filter(node => node.type === 'table')

	for (const node of tables) {
		const rows = node.children || []

		for (const row of rows) {
			const cells = row.children || []
			const texts = cells.map(cell => extract_text(cell.children || []).trim())

			const verse_ref = texts[0]

			// if the project is not English, the English text is found in the middle column.
			// so always take the target text from the last column
			const text = texts.at(-1)
			if (!verse_ref || !text) continue

			const verse = parse_verse_reference(verse_ref)
			if (verse) {
				verses.push({ ...verse, text })
			}
		}
	}

	return verses
	
	function extract_text(nodes: OfficeContentNode[]): string {
		return nodes.map(node => node.text || '').join(' ').replace(/\s+/g, ' ').trim()
	}

	function parse_verse_reference(reference: string): { chapter: number; verse: number } | null {
		const match = reference.match(/(\d+):(\d+)/)
		if (!match) return null
		return { chapter: Number(match[1]), verse: Number(match[2]) }
	}
}

async function parse_sfm(input_file: string): Promise<VerseTextData[]> {
	const contents = await Bun.file(input_file).text()
	const verses: VerseTextData[] = []
	let current_chapter = 0
	let current_verse = 0
	let current_text: string[] = []
	let current_title: string = ''

	const flush_current_verse = () => {
		const text = current_text.join(' ').replace(/\s+/g, ' ').trim()
		if (current_chapter > 0 && current_verse > 0 && text) {
			verses.push({ chapter: current_chapter, verse: current_verse, text })
		}
		current_text = []
	}

	for (const raw_line of contents.split(/\r?\n/)) {
		const line = raw_line.trim()
		if (!line) continue

		const chapter_match = line.match(/^\\c\s+(\d+)/)
		if (chapter_match) {
			flush_current_verse()
			current_chapter = Number(chapter_match[1])
			current_verse = 0
			continue
		}

		const verse_match = line.match(/^\\v\s+(\d+)(?:\s+(.*))?$/)
		if (verse_match) {
			flush_current_verse()
			if (current_title) {
				current_text.push(current_title)
				current_title = ''
			}
			current_chapter = current_chapter || 1
			current_verse = Number(verse_match[1])
			current_text.push(verse_match[2] || '')
			continue
		}

		const title_match = line.match(/^\\s\s+(.*)$/)
		if (title_match) {
			const title = title_match[1]
			// Sometimes the 'Title:' tag is removed, or the ending period is removed for Paratext.
			// We want to insert them back here.
			current_title = `Title: ${title}${title.endsWith('.') ? '' : '.'}`
		}

		// TODO handle footnotes

		if (current_chapter > 0 && current_verse > 0 && !line.startsWith('\\')) {
			current_text.push(line)
		}
	}

	flush_current_verse()
	return verses
}
