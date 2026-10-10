import type { D1Database, D1Result } from '@cloudflare/workers-types'
import type { DbSource } from '#lib/types.js'
import type { Reference, PrimaryId, SecondaryId, SourceType, TertiaryId } from '@tabitha/types'

export async function get_types(db: D1Database): Promise<SourceType[]> {
	const sql = `
		SELECT DISTINCT type
		FROM Sources
	`

	const { results }: D1Result<SourceType> = await db.prepare(sql).all()
	return results
}

export async function get_primary_ids({ db, type }: { db: D1Database, type: string }): Promise<PrimaryId[]> {
	const sql = `
		SELECT DISTINCT id_primary
		FROM Sources
		WHERE type LIKE ?
	`

	const { results }: D1Result<PrimaryId> = await db.prepare(sql).bind(type).all()
	return results
}

export async function get_secondary_ids({ db, type, id_primary }: { db: D1Database, type: string, id_primary: string }): Promise<SecondaryId[]> {
	const sql = `
		SELECT DISTINCT id_secondary
		FROM Sources
		WHERE type LIKE ?
			AND id_primary LIKE ?
	`

	const { results }: D1Result<SecondaryId> = await db.prepare(sql).bind(type, id_primary).all()
	return results
}

export async function get_tertiary_ids({ db, type, id_primary, id_secondary }: { db: D1Database, type: string, id_primary: string, id_secondary: string }): Promise<TertiaryId[]> {
	const sql = `
		SELECT DISTINCT id_tertiary
		FROM Sources
		WHERE type LIKE ?
			AND id_primary LIKE ?
			AND id_secondary = ?
	`

	const { results }: D1Result<TertiaryId> = await db.prepare(sql).bind(type, id_primary, id_secondary).all()
	return results
}

export async function get_source_data({ db, type, id_primary, id_secondary, id_tertiary }: Reference & { db: D1Database }): Promise<DbSource | null> {
	const sql = `
		SELECT *
		FROM Sources
		WHERE type LIKE ?
			AND id_primary LIKE ?
			AND id_secondary = ?
			AND id_tertiary = ?
	`

	const result: DbSource | null = await db.prepare(sql).bind(type, id_primary, id_secondary, id_tertiary).first()
	return result
}
