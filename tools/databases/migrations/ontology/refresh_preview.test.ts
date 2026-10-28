import { describe, expect, it } from 'bun:test'
import { drop_tables_sql } from './refresh_preview'

describe('drop_tables_sql', () => {
	it('drops every listed table, deferring foreign keys so their order does not matter', () => {
		const sql = drop_tables_sql(['Concepts', 'Changes'])

		expect(sql).toContain('PRAGMA defer_foreign_keys = true;')
		expect(sql).toContain('DROP TABLE IF EXISTS "Concepts";')
		expect(sql).toContain('DROP TABLE IF EXISTS "Changes";')
	})

	it('quotes names so a table name with a quote cannot end the statement early', () => {
		expect(drop_tables_sql(['odd"name'])).toContain('DROP TABLE IF EXISTS "odd""name";')
	})
})
