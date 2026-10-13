import type { Database } from 'bun:sqlite'
import { create_logger } from '../log'

const log = create_logger('Ontology migration')

export function create_changes_table(tabitha_db: Database) {
	log.step(`Creating Changes table in ${tabitha_db.filename}...`)

	tabitha_db.run(`
		CREATE TABLE IF NOT EXISTS Changes (
			'id'								INTEGER PRIMARY KEY,
			'concept_stem'					TEXT,
			'concept_sense' 				TEXT,
			'concept_part_of_speech'	TEXT,
			'action'							TEXT,
			'data'							TEXT,
			'suggested_by_id'				INTEGER,
			'suggested_date'				TEXT,
			'approved_by_id'				INTEGER,
			'approved_date'				TEXT,
			'applied_date'					TEXT,
			'version'						TEXT
		)
	`)
}
