import type Database from 'bun:sqlite'
import { create_logger } from '../log'

const log = create_logger('Targets migration')

export function migrate_lexicon_table({ tbta_db, project, targets_db }: {
	tbta_db: Database
	project: string
	targets_db: Database
}) {
	const transformed_data = transform_tbta_data({ tbta_db, project })

	create_tabitha_table({ targets_db, project })

	load_data({ targets_db, transformed_data })
}

type TransformedData = {
	id: number
	project: string
	stem: string
	part_of_speech: string
	gloss: string
	features: string
	constituents: string
}

function transform_tbta_data({ tbta_db, project }: {
	tbta_db: Database
	project: string
}): TransformedData[] {
	const table_names = [
		'Adjectives',
		'Adpositions',
		'Adverbs',
		'Nouns',
		'Verbs',
		'Conjunctions',
		'Particles',
		'Pronouns',
	]
	const transformed_data = transform_data(table_names)

	return transformed_data

	function transform_data(table_names: string[]) {
		log.step(`Transforming part of speech data from ${tbta_db.filename}...`)

		const transformed_data = table_names.map(table_name => {
			const singular_part_of_speech = table_name.slice(0, -1)

			const sql = `
				SELECT	ID as id,
						'${project}' as project,
						Roots as stem,
						'${singular_part_of_speech}' as part_of_speech,
						Glosses as gloss,
						Features as features,
						Constituents as constituents
				FROM ${table_name}
				ORDER BY ID
			`
			return tbta_db.query<TransformedData, []>(sql).all()
		}).flat() // flattens data from each parts of speech table into a single array


		return transformed_data
	}
}

function create_tabitha_table({ targets_db, project }: {
	targets_db: Database
	project: string
}) {
	log.step(`Creating the "Lexicon" table in ${targets_db.filename} if it does not already exist...`)

	targets_db.run(`
		CREATE TABLE IF NOT EXISTS Lexicon (
			id				INTEGER,
			project			TEXT,
			stem			TEXT,
			part_of_speech	TEXT,
			gloss			TEXT,
			features		TEXT,
			constituents	TEXT,
			forms			TEXT
		)
	`)

	// Only this project's rows are being replaced this run -- other projects' rows (left untouched
	// since their raw input didn't change) must survive when targets_db was copied forward from a
	// prior run's output.
	targets_db.run('DELETE FROM Lexicon WHERE project = ?', [project])

	return targets_db
}

function load_data({ targets_db, transformed_data }: {
	targets_db: Database
	transformed_data: TransformedData[]
}) {
	log.step(`Loading ${transformed_data[0].project} data into the "Lexicon" table...`)

	for (const { id, project, stem, part_of_speech, gloss, features, constituents } of transformed_data) {
		targets_db.run(`
			INSERT INTO Lexicon (id, project, stem, part_of_speech, gloss, features, constituents)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, [id, project, stem, part_of_speech, gloss.trim(), features, constituents])
	}

}
