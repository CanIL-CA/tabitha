import { describe, expect, it } from 'bun:test'
import { select_backup_database } from './select_database'

const PRODUCTION = { name: 'Ontology_9494_2026-09-29' }
const PREVIEW_COPY = { name: 'Ontology_9494_preview_2026-09-29' }
const UNMERGED = { name: 'Ontology_9495_2026-10-05' }
const OLDER = { name: 'Ontology_9493_2026-06-25' }

const CONFIG_TEXT = `{
	"name": "ontology",
	// production
	"d1_databases": [
		{
			"binding": "DB_Ontology",
			"database_name": "Ontology_9494_2026-09-29",
			"database_id": "prod-id"
		}
	],
	"previews": {
		"vars": {
			"OAUTH_REDIRECT_PROXY_URL": "https://ontology.tabitha.bible/auth" // a URL must not read as a comment
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

describe('select_backup_database', () => {
	it('backs up production\'s database, not the newer Previews copy loaded right after it', () => {
		expect(select_backup_database({ config_text: CONFIG_TEXT, binding: 'DB_Ontology', databases: [OLDER, PRODUCTION, PREVIEW_COPY] })).toBe(PRODUCTION.name)
	})

	it('backs up production\'s database, not a newer one an unmerged data-update PR created', () => {
		expect(select_backup_database({ config_text: CONFIG_TEXT, binding: 'DB_Ontology', databases: [PRODUCTION, PREVIEW_COPY, UNMERGED] })).toBe(PRODUCTION.name)
	})

	it('throws when production\'s bound database no longer exists', () => {
		expect(() => select_backup_database({ config_text: CONFIG_TEXT, binding: 'DB_Ontology', databases: [PREVIEW_COPY, UNMERGED] })).toThrow(/isn't in this account's D1 databases/)
	})

	it('throws when the binding has no top-level entry', () => {
		expect(() => select_backup_database({ config_text: CONFIG_TEXT, binding: 'DB_Sources', databases: [PRODUCTION] })).toThrow(/No top-level d1_databases entry/)
	})
})
