import { describe, expect, it } from 'bun:test'
import { preview_database_name, repoint_d1_binding } from './deploy'

const CONFIG_TEXT = `{
	"name": "ontology",
	"d1_databases": [
		{
			"binding": "DB_Ontology",
			"database_name": "Ontology_9494_2026-06-25",
			"database_id": "old-ontology-id"
		},
		{
			"binding": "DB_Auth",
			"database_name": "Auth",
			"database_id": "auth-id"
		}
	],
	"previews": {
		// Previews share production's databases
		"d1_databases": [
			{
				"binding": "DB_Ontology",
				"database_name": "Ontology_9494_2026-06-25",
				"database_id": "old-ontology-id"
			}
		]
	}
}`

const NEW_DATABASE = { name: 'Ontology_9494_2026-09-29', uuid: 'new-ontology-id' }

describe('repoint_d1_binding', () => {
	it('repoints the binding at top level and in the previews block', () => {
		const result = repoint_d1_binding({ config_text: CONFIG_TEXT, binding: 'DB_Ontology', database: NEW_DATABASE })

		expect(result.match(/"Ontology_9494_2026-09-29"/g)).toHaveLength(2)
		expect(result.match(/"new-ontology-id"/g)).toHaveLength(2)
		expect(result).not.toContain('Ontology_9494_2026-06-25')
		expect(result).not.toContain('old-ontology-id')
	})

	it('leaves other bindings and comments untouched', () => {
		const result = repoint_d1_binding({ config_text: CONFIG_TEXT, binding: 'DB_Ontology', database: NEW_DATABASE })

		expect(result).toContain('"database_name": "Auth",\n\t\t\t"database_id": "auth-id"')
		expect(result).toContain('// Previews share production\'s databases')
	})

	it('does not match a binding that only shares a prefix', () => {
		const config_text = CONFIG_TEXT.replaceAll('"DB_Ontology"', '"DB_Ontology_Archive"')

		expect(() => repoint_d1_binding({ config_text, binding: 'DB_Ontology', database: NEW_DATABASE })).toThrow(/No d1_databases entry with binding "DB_Ontology"/)
	})

	it('throws when the binding is missing', () => {
		expect(() => repoint_d1_binding({ config_text: CONFIG_TEXT, binding: 'DB_Sources', database: NEW_DATABASE })).toThrow(/No d1_databases entry with binding "DB_Sources"/)
	})

	describe('with a separate preview database', () => {
		const PREVIEW_DATABASE = { name: 'Ontology_9494_preview_2026-09-29', uuid: 'new-preview-id' }

		it('points the top level at the new database and the previews block at the preview copy', () => {
			const result = repoint_d1_binding({ config_text: CONFIG_TEXT, binding: 'DB_Ontology', database: NEW_DATABASE, preview_database: PREVIEW_DATABASE })
			const previews_start = result.indexOf('"previews"')

			expect(result.indexOf('"new-ontology-id"')).toBeLessThan(previews_start)
			expect(result.match(/"new-ontology-id"/g)).toHaveLength(1)
			expect(result.indexOf('"new-preview-id"')).toBeGreaterThan(previews_start)
			expect(result).toContain('"database_name": "Ontology_9494_preview_2026-09-29"')
			expect(result).not.toContain('old-ontology-id')
		})

		it('repoints top-level entries that come after the previews block too', () => {
			const config_text = CONFIG_TEXT.replace(/\n\}$/, `,
	"after": {
		"d1_databases": [
			{
				"binding": "DB_Ontology",
				"database_name": "Ontology_9494_2026-06-25",
				"database_id": "old-ontology-id"
			}
		]
	}
}`)

			const result = repoint_d1_binding({ config_text, binding: 'DB_Ontology', database: NEW_DATABASE, preview_database: PREVIEW_DATABASE })

			expect(result.match(/"new-ontology-id"/g)).toHaveLength(2)
			expect(result.match(/"new-preview-id"/g)).toHaveLength(1)
		})

		it('ignores braces inside comments and strings when finding the previews block', () => {
			const config_text = CONFIG_TEXT.replace('// Previews share production\'s databases', '// a stray } in a comment\n\t\t"note": "and } in a string",')

			const result = repoint_d1_binding({ config_text, binding: 'DB_Ontology', database: NEW_DATABASE, preview_database: PREVIEW_DATABASE })

			expect(result.match(/"new-preview-id"/g)).toHaveLength(1)
			expect(result.match(/"new-ontology-id"/g)).toHaveLength(1)
		})

		it('throws when the previews block has no entry for the binding', () => {
			const config_text = CONFIG_TEXT.replace(/"previews": \{[\s\S]*\n\t\}/, '"previews": {}')

			expect(() => repoint_d1_binding({ config_text, binding: 'DB_Ontology', database: NEW_DATABASE, preview_database: PREVIEW_DATABASE })).toThrow(/previews block has no d1_databases entry/)
		})
	})
})

describe('preview_database_name', () => {
	it('inserts _preview before the date suffix, so cleanup treats copies as their own dated family', () => {
		expect(preview_database_name('Ontology_9494_2026-09-29')).toBe('Ontology_9494_preview_2026-09-29')
	})

	it('throws on an undated name', () => {
		expect(() => preview_database_name('Auth')).toThrow(/date-stamped/)
	})
})
