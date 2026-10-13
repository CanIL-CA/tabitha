import { resolve_dated_file } from '../resolve_dated_file'
import type { SqlRunner } from './sql_runner'
import { create_logger } from '../log'

const log = create_logger('Sources migration')

type CommaSeparatedValues = string

type VerseRange = {
	type: string
	id_primary: string
	id_secondary: string
	id_tertiary_start: number | null
	id_tertiary_end: number | null
}

type VerseStatusRecord = {
	range: VerseRange
	status: SourceStatus
}

type StatusTally = {
	not_started_count: number
	in_progress_count: number
	initial_complete_count: number
	review_count: number
	ready_count: number
	total_count: number
}

type InputStatus = 'Not Started' | 'STACK'
	| 'Drafter [HE1]' | 'First Review' | 'Second Review' | 'Checker [HE2>EBT]'
	| 'Zoho > ParaText' | 'Consultant' | 'Phase 1 Sign-off' | 'Holding' | 'Phase 2'
	| 'Phase 3 (POLISHING)' | 'Polish 2nd Language' | 'Completed This Period' | 'Complete' | 'Previously Complete'

type SourceStatus = 'Not Started' | 'Initial Analysis in Progress' | 'Initial Analysis Complete' | 'Final Review in Progress' | 'Ready to Translate'

const status_mapping: Record<InputStatus, SourceStatus> = {
	'Not Started': 'Not Started',
	'STACK': 'Not Started',
	'Drafter [HE1]': 'Initial Analysis in Progress',
	'First Review': 'Initial Analysis in Progress',
	'Second Review': 'Initial Analysis in Progress',
	'Checker [HE2>EBT]': 'Initial Analysis in Progress',
	'Zoho > ParaText': 'Initial Analysis in Progress',
	'Consultant': 'Initial Analysis in Progress',
	'Phase 1 Sign-off': 'Initial Analysis Complete',
	'Holding': 'Initial Analysis Complete',
	'Phase 2': 'Initial Analysis Complete',
	'Completed This Period': 'Initial Analysis Complete',
	'Phase 3 (POLISHING)': 'Final Review in Progress',
	'Polish 2nd Language': 'Final Review in Progress',
	'Complete': 'Ready to Translate',
	'Previously Complete': 'Ready to Translate',
}

export async function migrate_source_status({ runner, csv_dir, date }: {
	runner: SqlRunner
	csv_dir: string
	date: string
}): Promise<void> {
	const verse_statuses = await extract({ csv_dir, date })

	await update_verse_status({ verse_statuses, runner })

	create_chapter_status_table(runner)
	await populate_chapter_status_table({ runner, verse_statuses })
}

/**
 * Parses a Bible verse reference string into a VerseRange object.
 * Examples of accepted formats:
 *   "John 3"
 *   "Genesis 1:1-10"
 *   "Jude 1-8"
 */
function parse_verse_range(input: string): VerseRange {
	const regex = /^([\dA-Za-z\s]+?)\s*(\d*):?\s*(?:(\d+)-(\d+))?$/
	const match = input.trim().match(regex)

	if (!match) {
		return {
			type: 'Bible',
			id_primary: input,
			id_secondary: '',
			id_tertiary_start: null,
			id_tertiary_end: null,
		}
	}

	const [, id_primary, id_secondary, id_tertiary_start, id_tertiary_end] = match

	return {
		type: 'Bible',
		id_primary: id_primary.trim() === 'Psalm' ? 'Psalms' : id_primary.trim(),	// our Source uses 'Psalms' but the status data uses 'Psalm'
		id_secondary: id_secondary || '1',		// books like Jude only have one chapter, so default to "1" if no chapter is specified
		id_tertiary_start: id_tertiary_start ? parseInt(id_tertiary_start) : null,
		id_tertiary_end: id_tertiary_end ? parseInt(id_tertiary_end) : null,
	}
}

async function extract({ csv_dir, date }: {
	csv_dir: string
	date: string
}): Promise<VerseStatusRecord[]> {
	log.step('Getting verse statuses from the CSV files...')

	async function get_latest_csv(prefix: string): Promise<string> {
		const path = await resolve_dated_file({ dir: csv_dir, prefix, date, ext: 'csv' })
		if (!path) {
			throw new Error(`Critical Error: No fallback CSV found for ${prefix} in ${csv_dir}.`)
		}
		return await Bun.file(path).text()
	}

	const csv_contents_by_file = await Promise.all([
		get_latest_csv('OT_verse_status'),
		get_latest_csv('NT_verse_status'),
	])

	const normalized_data = csv_contents_by_file.map(normalize).flat()

	return normalized_data

	/**
	 * CSV format from Google Data Studio -- the leading ProjectStatusDate column has come and gone
	 * across different export dates, so its presence is detected from the header rather than assumed:
	 *
	 * ProjectStatusDate,StatusDetail,ProjectName,VerseCount        StatusDetail,ProjectName,VerseCount
	 * "May 1, 2026, 12:00:00 AM",Complete,Matthew 1:1-17,17        Complete,Matthew 1:1-17,17
	 * "May 1, 2026, 12:00:00 AM",Complete,Matthew 1:18-25,8        Complete,Matthew 1:18-25,8
	 */
	function normalize(csv_text: string): VerseStatusRecord[] {
		const [header, ...rows] = csv_text.split(/\r?\n/)
		const has_date_column = header.startsWith('ProjectStatusDate,')

		return rows
			.filter(line => line !== '')
			.map(row => transform(row))

		function transform(row: CommaSeparatedValues): VerseStatusRecord {
			// "May 1, 2026, 12:00:00 AM",Complete,Matthew 1:1-17,17 => Complete,Matthew 1:1-17,17
			const without_date = has_date_column ? row.slice(row.indexOf('",') + 2) : row
			const [csv_status, verse_range] = without_date.split(',')
			const range = parse_verse_range(verse_range ?? '')

			if (!(csv_status in status_mapping)) {
				log.warn(`Unrecognized status "${csv_status}" for "${verse_range}" -- defaulting to "Not Started". This usually means the CSV export format changed.`)
			}
			const status = status_mapping[csv_status as InputStatus] ?? 'Not Started'

			return { range, status }
		}
	}
}

async function update_verse_status({ verse_statuses, runner }: {
	verse_statuses: VerseStatusRecord[]
	runner: SqlRunner
}): Promise<void> {
	log.step('Loading verse statuses into Sources table...')

	for (const [index, { range, status }] of verse_statuses.entries()) {
		const { type, id_primary, id_secondary, id_tertiary_start, id_tertiary_end } = range

		if (id_tertiary_start && id_tertiary_end) {
			runner.run(`
				UPDATE Sources
				SET status = ?
				WHERE type = ?
					AND id_primary = ?
					AND id_secondary = ?
					AND CAST(id_tertiary AS INTEGER) BETWEEN ? AND ?
			`, [status, type, id_primary, id_secondary, id_tertiary_start, id_tertiary_end])

		} else {
			runner.run(`
				UPDATE Sources
				SET status = ?
				WHERE type = ?
					AND id_primary = ?
					AND id_secondary = ?
			`, [status, type, id_primary, id_secondary])
		}

		log.progress(`${id_primary} ${id_secondary}`, index + 1, verse_statuses.length)
	}

	log.finish_progress()
}

function create_chapter_status_table(runner: SqlRunner) {
	log.step('Prepping ChapterStatus table...')

	runner.run(`
		CREATE TABLE IF NOT EXISTS ChapterStatus (
			'type', -- e.g., Bible, Grammar Introduction, Community Development Texts
			'id_primary', -- for Bible, this would hold the book name, e.g., Genesis
			'id_secondary', -- for Bible, this would hold the chapter, e.g., 1
			'status'
		)
	`)

	runner.run(`
		DELETE FROM ChapterStatus
	`)
}

async function populate_chapter_status_table({ runner, verse_statuses }: {
	runner: SqlRunner
	verse_statuses: VerseStatusRecord[]
}) {
	log.step('Loading chapter statuses into ChapterStatus table...')

	const by_chapter = Map.groupBy(verse_statuses, ({ range: { type, id_primary, id_secondary } }) => JSON.stringify({ type, id_primary, id_secondary }))
	const chapters = Array.from(by_chapter.entries())

	for (const [index, [chapter_ref, statuses]] of chapters.entries()) {
		const status_tally: StatusTally = statuses.reduce((tally, { status }) => tally_status({ tally, status }), {
			not_started_count: 0,
			in_progress_count: 0,
			initial_complete_count: 0,
			review_count: 0,
			ready_count: 0,
			total_count: 0,
		})
		const chapter_status = get_status_from_tally(status_tally)
		const { type, id_primary, id_secondary } = JSON.parse(chapter_ref) as VerseRange

		runner.run(`
			INSERT INTO ChapterStatus
			VALUES (?, ?, ?, ?)
		`, [type, id_primary, id_secondary, chapter_status])

		log.progress(`${id_primary} ${id_secondary}`, index + 1, chapters.length)
	}

	log.finish_progress()

	function tally_status({ tally, status }: {
		tally: StatusTally
		status: SourceStatus
	}): StatusTally {
		if (status === 'Not Started') {
			tally.not_started_count += 1
		} else if (status === 'Initial Analysis in Progress') {
			tally.in_progress_count += 1
		} else if (status === 'Initial Analysis Complete') {
			tally.initial_complete_count += 1
		} else if (status === 'Final Review in Progress') {
			tally.review_count += 1
		} else if (status === 'Ready to Translate') {
			tally.ready_count += 1
		}
		tally.total_count += 1
		return tally
	}

	function get_status_from_tally(status_tally: StatusTally): SourceStatus {
		const status_count_mapping: [(tally: StatusTally) => boolean, SourceStatus][] = [
			[({ total_count, ready_count }) => total_count === ready_count, 'Ready to Translate'],
			[({ total_count, not_started_count }) => total_count === not_started_count, 'Not Started'],
			[({ not_started_count }) => not_started_count > 0, 'Initial Analysis in Progress'],
			[({ in_progress_count }) => in_progress_count > 0, 'Initial Analysis in Progress'],
			[({ review_count }) => review_count > 0, 'Final Review in Progress'],
			[() => true, 'Initial Analysis Complete'],
		]

		return status_tally ? status_count_mapping.find(([predicate]) => predicate(status_tally))![1] : 'Not Started'
	}
}
