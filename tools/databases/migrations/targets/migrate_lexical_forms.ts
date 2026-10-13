import type Database from 'bun:sqlite'
import { create_logger } from '../log'

const log = create_logger('Targets migration')
import { readdir } from 'node:fs/promises'

export async function migrate_lexical_forms({ project, targets_db, csv_dir }: {
	project: string
	targets_db: Database
	csv_dir: string
}): Promise<void> {
	const word_forms = await get_word_forms(csv_dir)

	await load_data({ word_forms, targets_db, project })
}

type WordFormRecord = {
	sequence_number: number
	stem: string
	part_of_speech: string
	forms: string
}
type PartOfSpeech = 'Adjective' | 'Adverb' | 'Noun' | 'Verb'

type WordFormMap = Record<PartOfSpeech, WordFormRecord[]> & {
	[key: string]: WordFormRecord[]
}

async function get_word_forms(csv_dir: string): Promise<Record<PartOfSpeech, WordFormRecord[]>> {
	log.step('Getting word forms from the CSV files...')

	const filenames = await readdir(csv_dir)
	const csv_contents_by_file = await Promise.all(filenames.map(filename => Bun.file(`${csv_dir}/${filename}`).text()))
	const normalized_data = csv_contents_by_file.map(normalize).flat()

	const groups_init: Record<PartOfSpeech, WordFormRecord[]> = { Adjective: [], Adverb: [], Noun: [], Verb: [] }


	return normalized_data.reduce((tracker: WordFormMap, item) => {
		tracker[item.part_of_speech].push(item)

		return tracker
	}, groups_init)

	function normalize(csv_text: string): WordFormRecord[] {
		return csv_text.split('\n')
			.filter(line => line !== '')
			.map(transform)

		function transform(line: string): WordFormRecord {
			// note: we can't just split(',') because some stems are numbers, e.g., 1,100 is the stem in this line "7,1,100,Adjective,|||"
			const [, sequence_number, stem, part_of_speech, forms] = line.match(/^(\d+),(.*),(Adjective|Adverb|Noun|Verb),(.*)$/) ?? []

			return { sequence_number: Number(sequence_number), stem, part_of_speech, forms }
		}
	}
}

/**
 * There is a delicate association between the a word's place in the Lexicon and the sequence number in the CSV file.
 * When the words in the Lexicon are ordered by their ID, the sequence number from the CSV file represents the "index"
 * of the word in the Lexicon.  Additionally, this is in the context of a single part of speech.
 */
async function load_data({ word_forms, targets_db, project }: {
	word_forms: WordFormMap
	targets_db: Database
	project: string
}): Promise<void> {
	log.step('Loading word forms into Lexicon table...')

	type LexiconRecord = {
		id: number
		project: string
		stem: string
		part_of_speech: string
		gloss: string
		features: string
		constituents: string
		forms: string
	}

	const total_forms = Object.values(word_forms).reduce((sum, forms) => sum + forms.length, 0)
	let current_index = 0

	for (const [part_of_speech, forms] of Object.entries(word_forms)) {
		const lexicon_words = targets_db.query<LexiconRecord, string[]>(`
			SELECT *
			FROM Lexicon
			WHERE project = ?
				AND part_of_speech = ?
			ORDER BY id
		`).all(project, part_of_speech)

		for (const from_word_forms of forms) {
			current_index++
			const from_lexicon = lexicon_words[from_word_forms.sequence_number - 1]

			if (is_match({ from_word_forms, from_lexicon })) {
				targets_db.run(`
					UPDATE Lexicon
					SET forms = ?
					WHERE project = ?
						AND part_of_speech = ?
						AND id = ?
				`, [from_word_forms.forms, project, part_of_speech, from_lexicon.id])
			} else {
				log.warn(`NOT LOADED due to mismatch: ${from_word_forms.stem} (from word forms) vs ${from_lexicon.stem} (from lexicon)`, `${part_of_speech} #${from_word_forms.sequence_number}`)
			}

			log.progress(`${part_of_speech} ${from_word_forms.stem}`, current_index, total_forms)
		}
	}

	log.finish_progress()


	type MatchInput = {
		from_word_forms: WordFormRecord
		from_lexicon: LexiconRecord
	}

	function is_match({ from_word_forms, from_lexicon }: MatchInput): boolean {
		// constituent data, when present, follows the format "constituent[hints]"
		const constituent = from_lexicon.constituents.split('[')?.[0]
		const stem_from_lexicon = constituent ? `${from_lexicon.stem} ${constituent}` : from_lexicon.stem

		return from_word_forms.stem === stem_from_lexicon
	}
}
