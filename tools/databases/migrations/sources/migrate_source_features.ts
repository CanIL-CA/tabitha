import type Database from 'bun:sqlite'
import { create_logger } from '../log'

const log = create_logger('Sources migration')

export function migrate_source_features({ tbta_db, sources_db }: {
	tbta_db: Database
	sources_db: Database
}) {
	const transformed_data = transform_tbta_data(tbta_db)

	create_tabitha_table(sources_db)

	load_data({ targets_db: sources_db, transformed_data })
}

const CATEGORIES: Record<number, string> = {
	1: 'Noun',
	2: 'Verb',
	3: 'Adjective',
	4: 'Adverb',
	5: 'Adposition',
	6: 'Conjunction',
	7: 'Phrasal',
	8: 'Particle',
	101: 'Noun Phrase',
	102: 'Verb Phrase',
	103: 'Adjective Phrase',
	104: 'Adverb Phrase',
	105: 'Clause',
}

type TransformedData = {
	category: string
	feature: string
	position: number
	code: string
	value: string
	example: string
}
function transform_tbta_data(tbta_db: Database): TransformedData[] {
	const extracted_data = extract()

	const transformed_data = transform()

	return transformed_data

	type DbRow = {
		id: number,
		category_id: number
		feature: string
		encoded_values: string
		encoded_examples: string
	}
	function extract(): DbRow[] {
		log.step(`Extracting features from ${tbta_db.filename}...`)

		const sql = `
		  SELECT	ID as id,
					SyntacticCategory as category_id,
					FeatureName as feature,
					FeatureValues as encoded_values,
					FeatureExamples as encoded_examples

		  FROM	Features_Source

		  ORDER BY category_id, id
	  `
		const results = tbta_db.prepare<DbRow, []>(sql).all().map(row => ({
			...row,
			encoded_examples: row.encoded_examples?.trim() ?? '', // sometimes examples start with non-printable characters, whitespace or may be NULL
		}))

		return results
	}

	/**
	* Transforming data from tbta that looks like this:
	*
	* | category		| feature						| encoded_values																						|
	* | ------------- | ------------------------ | ------------------------------------------------------------------------------ |
	* | Noun				| Number							| "Singular/S|Dual/D|Trial/T|Quadrial/Q|Paucal/p|Plural/P|"								|
	* | Noun				| Participant Tracking		| "First Mention/I|Routine/D|Integration/i|Exiting/E|Restaging/R|Offstage/O|..."	|
	* | Noun				| Polarity						| "Affirmative/A|Negative/N|"																		|
	* | Noun				| Proximity						| "Not Applicable/n|Near Speaker and Listener/N|Near Speaker/S|..."					|
	* | ...
	*
	* into data that looks like this for tabitha:
	*
	* | category		| feature						| position	| code	| value										|
	* | ------------- | ------------------------ | --------- | ------ | --------------------------------- |
	* | Noun				| Number							| 1			| S		| Singular									|
	* | Noun				| Number							| 1			| D		| Dual										|
	* | Noun				| Number							| 1			| T		| Trial										|
	* | Noun				| Number							| 1			| Q		| Quadrial									|
	* | Noun				| Number							| 1			| p		| Paucal										|
	* | Noun				| Number							| 1			| P		| Plural										|
	* | Noun				| Participant Tracking		| 2			| I		| First Mention							|
	* | Noun				| Participant Tracking		| 2			| D		| Routine									|
	* | Noun				| Participant Tracking		| 2			| i		| Integration								|
	* | Noun				| Participant Tracking		| 2			| E		| Exiting									|
	* | Noun				| Participant Tracking		| 2			| R		| Restaging									|
	* | Noun				| Participant Tracking		| 2			| O		| Offstage									|
	* | Noun				| Participant Tracking		| 2			| ...
	* | Noun				| Polarity						| 3			| A		| Affirmative								|
	* | Noun				| Polarity						| 3			| N		| Negative									|
	* | Noun				| Proximity						| 4			| n		| Not Applicable							|
	* | Noun				| Proximity						| 4			| N		| Near Speaker and Listener			|
	* | Noun				| Proximity						| 4			| S		| Near Speaker								|
	* | Noun				| Proximity						| 4			| ...
	* | ...
	*/
	function transform(): TransformedData[] {
		log.step(`Transforming data from ${tbta_db.filename}...`)

		const transformed_data: TransformedData[] = []

		type Category = string
		type Features = Set<string>
		const position_tracker = new Map<Category, Features>()
		for (const { category_id, feature, encoded_values, encoded_examples } of extracted_data) {
			const category = CATEGORIES[category_id]
			const features = position_tracker.get(category) ?? new Set()
			position_tracker.set(category, features.add(feature))
			const position = position_tracker.get(category)?.size ?? 0

			const examples = encoded_examples.split('|')

			// the last split value is always empty and can be discarded with .slice(0, -1)
			for (const [index, encoded_value] of encoded_values.split('|').slice(0, -1).entries()) {
				const [value, code] = encoded_value.split('/')
				const example = examples[index] ?? ''

				transformed_data.push({ category, feature, position, code, value, example })
			}
		}

		return transformed_data
	}
}

function create_tabitha_table(tabitha_sources_db: Database) {
	log.step(`Prepping Features table in ${tabitha_sources_db.filename}...`)

	tabitha_sources_db.run(`
		CREATE TABLE IF NOT EXISTS Features (
			category		TEXT,		-- the name of the category this feature is associated with
			feature		TEXT,		-- the name of the feature
			position		INTEGER,	-- the index/position of the feature within the semantic representation
			code			TEXT,		-- the letter used in the semantic representation, associated with a specific value
			value			TEXT,		-- the display text for this value
			example		TEXT
		)
	`)

	tabitha_sources_db.run(`
		DELETE FROM Features
	`)

	return tabitha_sources_db
}

function load_data({ targets_db, transformed_data }: {
	targets_db: Database
	transformed_data: TransformedData[]
}) {
	log.step('Loading data into Features table...')

	transformed_data.forEach(({ category, feature, position, code, value, example }, index) => {
		targets_db.run(`
			INSERT INTO Features (category, feature, position, code, value, example)
			VALUES (?, ?, ?, ?, ?, ?)
		`, [category, feature, position, code, value, example])

		log.progress(`${category} / ${feature}`, index + 1, transformed_data.length)
	})

	log.finish_progress()
}
