import type Database from 'bun:sqlite'
import { find_word_context, encoding_warnings } from './example_context'
import { transform_semantic_encoding } from './semantic_encoding'
import { create_logger, is_verbose } from '../../log'

const log = create_logger('Ontology migration')

export async function load_examples({ db_ontology, db_sources, db_sources_complex }: {
	db_ontology: Database
	db_sources: Database
	db_sources_complex: Database
}) {
	clear_examples_table(db_ontology)
	await find_exhaustive_occurrences({ db_ontology, db_sources, db_sources_complex })
	update_occurrences(db_ontology)

	if (is_verbose()) show_examples(db_ontology)
	show_top_occurrences(db_ontology)
}

function clear_examples_table(db_ontology: Database) {
	log.step(`Clearing Exhaustive_Examples table in ${db_ontology.filename}...`)

	db_ontology.run('DELETE FROM Exhaustive_Examples')
	db_ontology.run('UPDATE Concepts SET occurrences = 0')
}

/**
 * 
 * @param db_ontology The Tabitha ontology database
 * @param db_sources The Tabitha sources database
 * @param db_sources_complex The Tabitha sources database after Complex Concept Insertion rules have been applied
 */
async function find_exhaustive_occurrences({ db_ontology, db_sources, db_sources_complex }: {
	db_ontology: Database
	db_sources: Database
	db_sources_complex: Database
}) {
	log.step('Fetching all source encoding...')
	type Source = {
		type: string
		id_primary: string
		id_secondary: string
		id_tertiary: string
		semantic_encoding: string
	}

	const all_sources = db_sources.query<Source, []>(`
		SELECT type, id_primary, id_secondary, id_tertiary, semantic_encoding
		FROM Sources
		WHERE semantic_encoding <> ''
	`).all()
	log.info(`Fetched ${all_sources.length.toLocaleString()} verses`)

	// For tracking how complex concepts are handled, we need to know which concepts are complex
	const all_complex_concepts = db_ontology.query<Concept, []>(`
		SELECT stem, sense, part_of_speech
		FROM Concepts
		WHERE level = 2 OR level = 3
	`).all()
	const complex_concept_set = new Set(all_complex_concepts.map(concept_key))
	log.info(`Found ${complex_concept_set.size.toLocaleString()} complex concepts`)

	log.step('Collecting occurrences...')

	let current_reference: SourceReference = { type: '', id_primary: '', id_secondary: '', id_tertiary: '' }
	let current_index = 0
	for (const { semantic_encoding, type, id_primary, id_secondary, id_tertiary } of all_sources) {
		current_index++

		if (id_primary !== current_reference.id_primary) {
			log.finish_progress()
			log.info(`entering ${id_primary}`)
		}

		current_reference = { type, id_primary, id_secondary, id_tertiary }

		// For each word encountered, add the current verse reference to that word's examples
		const base_contexts = transform_semantic_encoding({ semantic_encoding, complex_concepts: complex_concept_set })
			.flatMap((_, index, source_entities) => find_word_context({ entity_index: index, source_entities }))
		record_occurrences({ db_ontology, reference: current_reference, contexts: base_contexts })

		// Find the occurrences of complex concepts that were explicated. db_sources_complex contains the verses after
		// the Complex Concept Insertion rules have been applied. Pairings have also been reduced to just the complex word.
		const complex_verse = db_sources_complex.query<{ semantic_encoding: string }, string[]>(`
			SELECT semantic_encoding
			FROM Sources
			WHERE type = ? AND id_primary = ? AND id_secondary LIKE ? AND id_tertiary LIKE ?
		`).get(type, id_primary, id_secondary, id_tertiary)
		if (complex_verse) {
			function normalize_complex_contexts_for_comparison(contexts: [Concept, ContextArguments][]): [Concept, string][] {
				return contexts
					.filter(([concept]) => concept.is_complex)
					.map(([concept, context]) => [
						concept,
						JSON.stringify(context)
							// remove the Pairing and Complex Handling values for comparison purposes
							.replaceAll(/,\s*"(Pairing|Complex Handling)":\s*".*?"/g, '')
							// remove the simple word of any pairing found so we're only comparing the complex word
							.replaceAll(/"[^"]*?[/\\]/g, '"'),
					])
			}

			const complex_contexts = transform_semantic_encoding({ semantic_encoding: complex_verse.semantic_encoding, complex_concepts: complex_concept_set })
				.flatMap((entity, index, source_entities) => entity.concept?.is_complex ? find_word_context({ entity_index: index, source_entities }) : [])
			const normalized_complex_contexts = normalize_complex_contexts_for_comparison(complex_contexts)
			const normalized_base_contexts = normalize_complex_contexts_for_comparison(base_contexts)

			// This isn't a perfect solution because there may be multiple occurrences with the same context, and it (rarely) may also falsely identify an unmatched context.
			function contexts_equal({ complex_entry: [c1, json1], base_entry: [c2, json2] }: {
				complex_entry: [Concept, string]
				base_entry: [Concept, string]
			}): boolean {
				return c1.stem === c2.stem && c1.sense === c2.sense && c1.part_of_speech === c2.part_of_speech && json1 === json2
			}
			const unmatched_complex = normalized_complex_contexts.filter(complex_entry => !normalized_base_contexts.some(base_entry => contexts_equal({ complex_entry, base_entry })))
			const unmatched_base = normalized_base_contexts.filter(base_entry => !normalized_complex_contexts.some(complex_entry => contexts_equal({ complex_entry, base_entry })))

			// Check for any redundant occurrences due to other explicated concepts.
			// eg. 'God blessed the seventh day' -> 'God blessed the Sabbath'
			// 	Here 'Sabbath' was explicated, causing the context for 'bless' to differ from the base context.
			// 	We only want to record the base occurrence for 'bless'.
			// 	Each occurrence of 'Sabbath' will still be recorded.
			const grouped_unmatched_complex = Map.groupBy(unmatched_complex, ([concept]) => concept_key(concept))
			const grouped_unmatched_base = Map.groupBy(unmatched_base, ([concept]) => concept_key(concept))
			function context_is_unique([concept, context]: [Concept, string]): boolean {
				const key = concept_key(concept)
				const unmatched_complex_for_concept = grouped_unmatched_complex.get(key) || []
				const unmatched_base_for_concept = grouped_unmatched_base.get(key) || []

				// If there are different number of unmatched contexts in the base and complex versions for this concept,
				// 	then it is likely the complex occurrences are not redundant
				if (unmatched_complex_for_concept.length !== unmatched_base_for_concept.length) {
					return true
				}
				// If any of the other explicated concepts are present in this context, then this occurrence is likely redundant
				const other_unmatched_complex_concepts = [...grouped_unmatched_complex.keys()].filter(k => k !== key)
					.map(k => k.split('|')).map(([stem, sense]) => `${stem}-${sense}`)
				return !other_unmatched_complex_concepts.some(c => context.includes(`"${c}"`))
				// There may still be a rare case where a redundant occurrence is recorded, but this will catch most cases.
			}

			const explicated_contexts = unmatched_complex.filter(context_is_unique)
				.map(([concept, context]) => [concept, { ...JSON.parse(context), 'Complex Handling': 'Explication' }] as [Concept, ContextArguments])

			if (explicated_contexts.length > 0) {
				record_occurrences({ db_ontology, reference: current_reference, contexts: explicated_contexts })
			}
		}

		if (encoding_warnings.length > 0) {
			const reference = `${id_primary} ${id_secondary}:${id_tertiary}`
			for (const message of encoding_warnings) {
				log.warn(message, reference)
			}
			encoding_warnings.length = 0
		}

		log.progress(`${id_primary} ${id_secondary}:${id_tertiary}`, current_index, all_sources.length)
	}

	log.finish_progress()
}

function concept_key(concept: Concept): string {
	return `${concept.stem}|${concept.sense}|${concept.part_of_speech}`
}

function record_occurrences({ db_ontology, reference, contexts }: {
	db_ontology: Database
	reference: SourceReference
	contexts: [Concept, ContextArguments][]
}) {
	// doing the insertions in a transaction is much faster
	db_ontology.transaction(() => {
		for (const [concept, context] of contexts) {
			record_occurrence({ db_ontology, concept, reference, context })
		}
	})()
}

function record_occurrence({ db_ontology, concept, reference, context }: {
	db_ontology: Database
	concept: Concept
	reference: SourceReference
	context: ContextArguments
}) {
	const { stem, sense, part_of_speech } = concept
	const { type, id_primary, id_secondary, id_tertiary } = reference
	// using query() caches the statement, making this faster for bulk inserts
	db_ontology.query(`
		INSERT INTO Exhaustive_Examples (concept_stem, concept_sense, concept_part_of_speech, ref_type, ref_id_primary, ref_id_secondary, ref_id_tertiary, context_json)
		SELECT ?, ?, ?, ?, id, ?, ?, ?
		FROM Reference_Primary_Lookup
		WHERE type = ? AND name = ?
	`).run(stem, sense, part_of_speech, type, id_secondary, id_tertiary, JSON.stringify(context), type, id_primary)
}

async function update_occurrences(db_ontology: Database) {
	log.step('Updating occurrences count for each concept...')

	db_ontology.run(`
		UPDATE Concepts
		SET occurrences = Examples.occurrences
		FROM (
			SELECT	concept_stem AS stem,
						concept_sense AS sense,
						concept_part_of_speech AS part_of_speech,
						COUNT(context_json) AS occurrences
			FROM Exhaustive_Examples
			GROUP BY stem, sense, part_of_speech
		) AS Examples
		WHERE Concepts.stem = Examples.stem AND Concepts.sense = Examples.sense AND Concepts.part_of_speech = Examples.part_of_speech
	`)
}

function load_book_map(db_ontology: Database): Map<number, string> {
	// load book names into a map for easy lookup
	const books = db_ontology.query<{ id: number, name: string }, []>(`
		SELECT id, name
		FROM Reference_Primary_Lookup
		WHERE type = 'Bible'
	`).all()
	return new Map(books.map(book => [book.id, book.name]))
}

function show_examples(db_ontology: Database) {
	const books = load_book_map(db_ontology)

	log.verbose('======= Noun Examples =======')
	// destination role; outer noun & adposition; destination role & adposition
	show_examples({ concept: { stem: 'Moab', sense: 'A', part_of_speech: 'Noun' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 1 } })
	// outer adjective
	show_examples({ concept: { stem: 'husband', sense: 'A', part_of_speech: 'Noun' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 8 } })

	log.verbose('======= Verb Examples =======')
	// coordinate agent & source & destination
	show_examples({ concept: { stem: 'move', sense: 'A', part_of_speech: 'Verb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 1 } })
	// negative polarity & predicate adjective
	show_examples({ concept: { stem: 'be', sense: 'D', part_of_speech: 'Verb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 12 } })
	// negative polarity & patient proposition
	show_examples({ concept: { stem: 'tell', sense: 'B', part_of_speech: 'Verb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 16 } })
	// most patient-like
	show_examples({ concept: { stem: 'bury', sense: 'A', part_of_speech: 'Verb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 17 } })
	// agent proposition & predicate adjective
	show_examples({ concept: { stem: 'be', sense: 'V', part_of_speech: 'Verb' }, reference: { type: 'Bible', ref_id_primary: 1, ref_id_secondary: 2, ref_id_tertiary: 18 } })
	// complex pairing
	show_examples({ concept: { stem: 'cry', sense: 'A', part_of_speech: 'Verb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 14 } })
	show_examples({ concept: { stem: 'weep', sense: 'A', part_of_speech: 'Verb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 14 } })

	log.verbose('======= Adjective Examples =======')
	// modified noun
	show_examples({ concept: { stem: 'much-many', sense: 'A', part_of_speech: 'Adjective' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 1 } })
	// patient noun
	show_examples({ concept: { stem: 'kind', sense: 'B', part_of_speech: 'Adjective' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 8 } })
	// patient clause
	show_examples({ concept: { stem: 'able', sense: 'A', part_of_speech: 'Adjective' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 12 } })
	// 'too' degree
	show_examples({ concept: { stem: 'old', sense: 'A', part_of_speech: 'Adjective' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 12 } })
	// comparative degree & patient noun
	show_examples({ concept: { stem: 'good', sense: 'A', part_of_speech: 'Adjective' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 4, ref_id_tertiary: 15 } })
	// complex pairing
	show_examples({ concept: { stem: 'sad', sense: 'A', part_of_speech: 'Adjective' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 13 } })
	show_examples({ concept: { stem: 'bitter', sense: 'B', part_of_speech: 'Adjective' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 13 } })

	log.verbose('======= Adverb Examples =======')
	// modified noun
	show_examples({ concept: { stem: 'also', sense: 'C', part_of_speech: 'Adverb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 5 } })
	// intensified degree
	show_examples({ concept: { stem: 'kindly', sense: 'A', part_of_speech: 'Adverb' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 2, ref_id_tertiary: 13 } })
	// comparative degree
	show_examples({ concept: { stem: 'hard', sense: 'A', part_of_speech: 'Adverb' }, reference: { type: 'Bible', ref_id_primary: 32, ref_id_secondary: 1, ref_id_tertiary: 11 } })

	log.verbose('======= Adposition Examples =======')
	// no argument
	show_examples({ concept: { stem: 'when', sense: 'C', part_of_speech: 'Adposition' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 1 } })
	// noun & verb
	show_examples({ concept: { stem: 'in', sense: 'B', part_of_speech: 'Adposition' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 1 } })
	// noun & outer noun
	show_examples({ concept: { stem: '-Name', sense: 'A', part_of_speech: 'Adposition' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 1 } })
	// adjective & outer noun
	show_examples({ concept: { stem: '-Subgroup', sense: 'A', part_of_speech: 'Adposition' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 2, ref_id_tertiary: 11 } })

	log.verbose('======= Conjunction Examples =======')
	// no argument (within NP)
	show_examples({ concept: { stem: 'and', sense: 'B', part_of_speech: 'Conjunction' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 2 } })
	// no argument (within Clause)
	show_examples({ concept: { stem: 'but', sense: 'A', part_of_speech: 'Conjunction' }, reference: { type: 'Bible', ref_id_primary: 8, ref_id_secondary: 1, ref_id_tertiary: 2 } })

	function show_examples({ concept: { stem, sense, part_of_speech }, reference: { ref_id_primary, ref_id_secondary, ref_id_tertiary } }: {
		concept: Concept
		reference: ExampleReference
	}) {
		type ExampleContext = {
			context_json: string
		}
		const examples = db_ontology.query<ExampleContext, (string | number)[]>(`
			SELECT context_json
			FROM Exhaustive_Examples
			WHERE concept_stem = ? AND concept_sense = ? AND concept_part_of_speech = ? AND ref_id_primary = ? AND ref_id_secondary = ? AND ref_id_tertiary = ?
		`).all(stem, sense, part_of_speech, ref_id_primary, ref_id_secondary, ref_id_tertiary)

		log.verbose(`––– ${stem}-${sense} in ${books.get(ref_id_primary)} ${ref_id_secondary}:${ref_id_tertiary} –––`)
		for (const { context_json } of examples) {
			log.verbose(context_json)
		}
	}
}

function show_top_occurrences(db_ontology: Database) {
	type OccurrenceData = {
		stem: string
		sense: string
		part_of_speech: string
		occurrences: number
	}
	const top_occurrences = db_ontology.query<OccurrenceData, []>(`
		SELECT stem, sense, part_of_speech, occurrences
		FROM Concepts
		ORDER BY occurrences DESC
		LIMIT 10
	`).all()

	log.step('Top 10 concepts by occurrences:')
	console.table(top_occurrences)
}
