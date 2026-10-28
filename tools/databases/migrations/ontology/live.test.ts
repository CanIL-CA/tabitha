import { describe, expect, it } from 'bun:test'
import { ontology_database_name, parse_target, to_d1_importable } from './live'

const CONFIG_TEXT = `{
	"name": "ontology",
	// production
	"d1_databases": [
		{
			"binding": "DB_Ontology",
			"database_name": "Ontology_9494_2026-09-29",
			"database_id": "prod-id"
		},
		{
			"binding": "DB_Auth",
			"database_name": "Auth",
			"database_id": "auth-id"
		}
	],
	"previews": {
		"vars": {
			"OAUTH_REDIRECT_PROXY_URL": "https://ontology.tabitha.bible" // a URL must not read as a comment
		},
		"d1_databases": [
			{
				"binding": "DB_Ontology",
				"database_name": "Ontology_9494_preview_2026-09-29",
				"database_id": "preview-id"
			}
		]
	}
}`

describe('ontology_database_name', () => {
	it('reads production from the top level and Previews from the previews block', () => {
		expect(ontology_database_name({ config_text: CONFIG_TEXT, target: 'production' })).toBe('Ontology_9494_2026-09-29')
		expect(ontology_database_name({ config_text: CONFIG_TEXT, target: 'preview' })).toBe('Ontology_9494_preview_2026-09-29')
	})

	it('throws when the target has no DB_Ontology entry', () => {
		const config_text = CONFIG_TEXT.replace(/"previews": \{[\s\S]*\n\t\}/, '"previews": {}')

		expect(() => ontology_database_name({ config_text, target: 'preview' })).toThrow(/No preview d1_databases entry/)
	})
})

describe('parse_target', () => {
	it('accepts the two targets', () => {
		expect(parse_target('production')).toBe('production')
		expect(parse_target('preview')).toBe('preview')
	})

	it('rejects anything else, including a missing argument', () => {
		expect(() => parse_target('staging')).toThrow(/production or preview/)
		expect(() => parse_target(undefined)).toThrow(/production or preview/)
	})
})

describe('to_d1_importable', () => {
	it('drops the PRAGMA and transaction lines D1 rejects and keeps the rest', () => {
		const dump = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;', 'CREATE TABLE T (a TEXT);', "INSERT INTO T VALUES('BEGIN TRANSACTION');", 'COMMIT;'].join('\n')

		expect(to_d1_importable(dump)).toBe(['CREATE TABLE T (a TEXT);', "INSERT INTO T VALUES('BEGIN TRANSACTION');"].join('\n'))
	})
})
