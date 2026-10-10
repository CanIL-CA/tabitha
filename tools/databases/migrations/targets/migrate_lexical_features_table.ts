import type Database from 'bun:sqlite'
import { create_logger } from '../log'

const log = create_logger('Targets migration')

export function migrate_lexical_features_table({ tbta_db, project, targets_db }: {
	tbta_db: Database
	project: string
	targets_db: Database
}) {
	const transformed_data = transform_tbta_data(tbta_db)

	create_tabitha_table({ targets_db, project })

	load_data({ targets_db, project, transformed_data })
}

type TransformedData = {
	category: string
	feature: string
	position: number
	code: string
	value: string
	notes: string
}
function transform_tbta_data(tbta_db: Database): TransformedData[] {
	const extracted_data = extract()

	const transformed_data = transform()

	return transformed_data

	type DbRow = {
		category: string
		feature: string
		encoded_values: string
		notes: string
	}
	function extract(): DbRow[] {
		log.step(`Extracting features from ${tbta_db.filename}...`)

		const sql = `
		  SELECT	SyntacticName as category,
					FeatureName as feature,
					FeatureValues as encoded_values,
					Comment as notes

		  FROM	Features_Target
			  INNER JOIN	SyntacticCategories
			  ON				SyntacticCategory = SyntacticCategories.ID

		  ORDER BY SyntacticCategory
	  `
		const results = tbta_db.prepare<DbRow, []>(sql).all().map(row => ({
			...row,
			notes: (row.notes ?? '').replace(/\r/g, '').trim(), // sometimes notes start with non-printable characters or whitespace
		}))


		return results
	}

	/**
	* Transforming data from tbta that looks like this:
	*
	* | category		| feature						| encoded_values																						|
	* | ------------- | ------------------------ | ------------------------------------------------------------------------------ |
	* | Noun				| Common/Proper				| "Common/C|Proper/P|"																				|
	* | Noun				| Gender							| "Neuter/N|Masculine/M|Feminine/F|"															|
	* | Noun				| Type of Relative Clause	| "Standard/S|Locative - Relativizer is where/L|Temporal - Relativizer is when/T"|
	* | Noun				| Count/Mass					| "Countable/C|Mass/M|"																				|
	* | ...
	*
	* into data that looks like this for tabitha:
	*
	* | category		| feature						| position	| code	| value										|
	* | ------------- | ------------------------ | --------- | ------ | --------------------------------- |
	* | Noun				| Common/Proper				| 1			| C		| Common										|
	* | Noun				| Common/Proper				| 1			| P		| Proper										|
	* | Noun				| Gender							| 2			| N		| Neuter										|
	* | Noun				| Gender							| 2			| M		| Masculine									|
	* | Noun				| Gender							| 2			| F		| Feminine									|
	* | Noun				| Type of Relative Clause	| 3			| S		| Standard									|
	* | Noun				| Type of Relative Clause	| 3			| L		| Locative - Relativizer is where	|
	* | Noun				| Type of Relative Clause	| 3			| T		| Temporal - Relativizer is when		|
	* | Noun				| Count/Mass					| 4			| C		| Countable									|
	* | Noun				| Count/Mass					| 4			| M		| Mass										|
	* | ...
	*/
	function transform(): TransformedData[] {
		log.step(`Transforming data from ${tbta_db.filename}...`)

		const transformed_data: TransformedData[] = []

		type PartOfSpeech = string
		type Features = Set<string>
		const position_tracker = new Map<PartOfSpeech, Features>()
		for (const { category, feature, encoded_values, notes } of extracted_data) {
			const features = position_tracker.get(category) ?? new Set()
			position_tracker.set(category, features.add(feature))
			const position = position_tracker.get(category)?.size ?? 0

			for (const encoded_value of encoded_values.split('|').filter(entry => entry !== '')) {
				const [value, code] = encoded_value.split('/')

				transformed_data.push({ category, feature, position, code, value, notes })
			}
		}


		return transformed_data
	}
}

function create_tabitha_table({ targets_db, project }: {
	targets_db: Database
	project: string
}) {
	log.step(`Creating Lexical_Features table in ${targets_db.filename}...`)

	targets_db.run(`
		CREATE TABLE IF NOT EXISTS Lexical_Features (
			project			TEXT,
			category			TEXT,
			feature			TEXT,
			position			INTEGER,
			code				TEXT,
			value				TEXT,
			notes				TEXT
		)
	`)

	// Only this project's rows are being replaced this run -- other projects' rows (left untouched
	// since their raw input didn't change) must survive when targets_db was copied forward from a
	// prior run's output.
	targets_db.run('DELETE FROM Lexical_Features WHERE project = ?', [project])

	return targets_db
}

function load_data({ targets_db, project, transformed_data }: {
	targets_db: Database
	project: string
	transformed_data: TransformedData[]
}) {
	log.step('Loading data into Lexical_Features table...')

	transformed_data.forEach(({ category, feature, position, code, value, notes }, index) => {
		targets_db.run(`
			INSERT INTO Lexical_Features (project, category, feature, position, code, value, notes)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, [project, category, feature, position, code, value, notes])

		log.progress(`${category} / ${feature}`, index + 1, transformed_data.length)
	})

	log.finish_progress()
}
