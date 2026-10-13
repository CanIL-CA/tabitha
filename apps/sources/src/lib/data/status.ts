import type { D1Database } from '@cloudflare/workers-types'
import type {
	Reference,
	SourceStatus,
	PrimaryIdReference,
	SecondaryIdReference,
	PrimaryIdSourceStatusResult,
	SecondaryIdSourceStatusResult,
	SourceStatusResult,
} from '@tabitha/types'

export async function get_all_book_statuses({ db, type }: { db: D1Database, type: string }): Promise<PrimaryIdSourceStatusResult[]> {
	const sql = `
		SELECT status, id_primary
		FROM ChapterStatus
		WHERE type LIKE ?
	`
	const { results } = await db.prepare(sql).bind(type).all<{ status: SourceStatus, id_primary: string }>()
	const by_book = Map.groupBy(results, result => result.id_primary)

	return by_book.entries().map<PrimaryIdSourceStatusResult>(([id_primary, statuses]) => ({
		reference: { type, id_primary },
		status: combine_statuses(statuses),
	})).toArray()
}

export async function get_book_status({ db, reference }: { db: D1Database, reference: PrimaryIdReference }): Promise<PrimaryIdSourceStatusResult> {
	const sql = `
		SELECT status
		FROM ChapterStatus
		WHERE type LIKE ?
			AND id_primary LIKE ?
	`

	const { results } = await db.prepare(sql).bind(reference.type, reference.id_primary).all<{ status: SourceStatus }>()
	return {
		reference,
		status: combine_statuses(results),
	}
}

export function combine_statuses(status_array: { status: SourceStatus }[]) {
	const just_statuses = status_array.map(({ status }) => status)
	const status_mapping: [(statuses: SourceStatus[]) => boolean, SourceStatus][] = [
		[statuses => statuses.every(s => s === 'Ready to Translate'), 'Ready to Translate'],
		[statuses => statuses.every(s => s === 'Not Started'), 'Not Started'],
		[statuses => statuses.some(s => s === 'Not Started'), 'Initial Analysis in Progress'],
		[statuses => statuses.some(s => s === 'Initial Analysis in Progress'), 'Initial Analysis in Progress'],
		[statuses => statuses.some(s => s === 'Final Review in Progress'), 'Final Review in Progress'],
		[() => true, 'Initial Analysis Complete'],
	]
	return just_statuses.length ? status_mapping.find(([predicate]) => predicate(just_statuses))![1] : 'Not Started'
}

export async function get_chapter_statuses_for_book({ db, reference }: { db: D1Database, reference: PrimaryIdReference }): Promise<SecondaryIdSourceStatusResult[]> {
	const sql = `
		SELECT id_secondary, status
		FROM ChapterStatus
		WHERE type LIKE ?
			AND id_primary LIKE ?
	`

	const { results } = await db.prepare(sql).bind(reference.type, reference.id_primary).all<{ id_secondary: string, status: SourceStatus }>()
	return results.map(({ id_secondary, status }) => ({
		level: 'secondary',
		reference: { ...reference, id_secondary },
		status,
	}))
}

export async function get_chapter_status({ db, reference }: { db: D1Database, reference: SecondaryIdReference }): Promise<SecondaryIdSourceStatusResult> {
	const sql = `
		SELECT status
		FROM ChapterStatus
		WHERE type LIKE ?
			AND id_primary LIKE ?
			AND id_secondary = ?
	`

	const prepared_statement = db.prepare(sql).bind(reference.type, reference.id_primary, reference.id_secondary!.toString())
	const result = await prepared_statement.first<{ status: SourceStatus }>()

	return {
		reference,
		status: result?.status ?? 'Not Started',
	}
}

export async function get_verse_statuses({ db, references }: { db: D1Database, references: Reference[] }): Promise<SourceStatusResult[]> {
	const sql = `
		SELECT status
		FROM Sources
		WHERE type LIKE ?
			AND id_primary LIKE ?
			AND id_secondary = ?
			AND id_tertiary = ?
	`

	const prepared_statement = db.prepare(sql)
	const bound_statements = references.map(({ type, id_primary, id_secondary, id_tertiary }) =>
		prepared_statement.bind(type, id_primary, id_secondary.toString(), id_tertiary.toString()),
	)

	const batch_result = await db.batch<{ status: SourceStatus }>(bound_statements)
	const statuses = batch_result.map(r => r.results[0]?.status || 'Not Started')

	return references.map((reference, i) => ({
		reference,
		status: statuses[i],
	}))
}
