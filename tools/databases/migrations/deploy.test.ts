import { describe, expect, it } from 'bun:test'
import { repoint_d1_binding } from './deploy'

const CONFIG_TEXT = `{
	"name": "sources",
	"d1_databases": [
		{
			"binding": "DB_Sources",
			"database_name": "Sources_2026-06-25",
			"database_id": "old-sources-id"
		},
		{
			"binding": "DB_Other",
			"database_name": "Other",
			"database_id": "other-id"
		}
	],
	"previews": {
		// Previews share production's databases
		"d1_databases": [
			{
				"binding": "DB_Sources",
				"database_name": "Sources_2026-06-25",
				"database_id": "old-sources-id"
			}
		]
	}
}`

const NEW_DATABASE = { name: 'Sources_2026-09-29', uuid: 'new-sources-id' }

describe('repoint_d1_binding', () => {
	it('repoints the binding at top level and in the previews block', () => {
		const result = repoint_d1_binding({ config_text: CONFIG_TEXT, binding: 'DB_Sources', database: NEW_DATABASE })

		expect(result.match(/"Sources_2026-09-29"/g)).toHaveLength(2)
		expect(result.match(/"new-sources-id"/g)).toHaveLength(2)
		expect(result).not.toContain('Sources_2026-06-25')
		expect(result).not.toContain('old-sources-id')
	})

	it('leaves other bindings and comments untouched', () => {
		const result = repoint_d1_binding({ config_text: CONFIG_TEXT, binding: 'DB_Sources', database: NEW_DATABASE })

		expect(result).toContain('"database_name": "Other",\n\t\t\t"database_id": "other-id"')
		expect(result).toContain("// Previews share production's databases")
	})

	it('does not match a binding that only shares a prefix', () => {
		const config_text = CONFIG_TEXT.replaceAll('"DB_Sources"', '"DB_Sources_Archive"')

		expect(() => repoint_d1_binding({ config_text, binding: 'DB_Sources', database: NEW_DATABASE })).toThrow(/No d1_databases entry with binding "DB_Sources"/)
	})

	it('throws when the binding is missing', () => {
		expect(() => repoint_d1_binding({ config_text: CONFIG_TEXT, binding: 'DB_Targets_English', database: NEW_DATABASE })).toThrow(/No d1_databases entry with binding "DB_Targets_English"/)
	})
})
