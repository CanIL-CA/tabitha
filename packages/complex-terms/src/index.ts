import type { OntologyStatus, PartOfSpeech, SimplificationHint } from '@tabitha/types'

// The how-to sheet is the one source of truth for Complex_Terms. apps/ontology's scheduled sync
// rebuilds the table from it through this module (the 2026-09-29 TBTA export shipped its own stale
// copy of the table).
const COMPLEX_TERMS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/16_U4MqhwHNd9fR9Ai5ZeAI4AzBFGEAi3KhNyMQbEHlM/export?format=tsv&gid=0'
const HEADER_ROW_COUNT = 3

export const CREATE_COMPLEX_TERMS_TABLE_SQL = `
	CREATE TABLE IF NOT EXISTS Complex_Terms (
		'stem' 				TEXT,
		'sense'				TEXT,
		'part_of_speech' 	TEXT,
		'structure'		 	TEXT,
		'pairing' 			TEXT,
		'explication' 		TEXT,
		'ontology_status'	TEXT,
		'level'				INTEGER,
		'notes'				TEXT
	)
`

export const INSERT_COMPLEX_TERMS_SQL = `
	INSERT INTO Complex_Terms (stem, sense, part_of_speech, structure, pairing, explication, ontology_status, level, notes)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`

export async function fetch_complex_terms(): Promise<SimplificationHint[]> {
	const response = await fetch(COMPLEX_TERMS_SHEET_URL)

	if (!response.ok) {
		throw new Error(`Failed to fetch complex terms sheet: ${response.status} ${response.statusText}`)
	}

	return parse_complex_terms(await response.text())
}

export function parse_complex_terms(tsv: string): SimplificationHint[] {
	const rows = tsv.split(/\r?\n/).slice(HEADER_ROW_COUNT).filter(row => row.trim())

	return rows.map(row => {
		const [term = '', part_of_speech = '', structure = '', pairing = '', explication = '', ontology_status = '', level = '', notes = ''] = row.split('\t')

		// "love-A" -> stem "love", sense "A"
		const term_match = term.trim().match(/^(.*)-([A-Z])$/)
		const [stem, sense] = term_match ? [term_match[1], term_match[2]] : [term, '']

		// "level 2" -> 2, anything else -> -1
		const level_match = level.trim().match(/^level (\d)$/)

		return {
			stem,
			sense,
			part_of_speech: capitalize(part_of_speech) as PartOfSpeech,
			structure,
			pairing,
			explication,
			ontology_status: ontology_status as OntologyStatus,
			level: level_match ? parseInt(level_match[1]) : -1,
			notes,
		}
	})
}

function capitalize(text: string): string {
	const lowered = text.trim().toLowerCase()
	return lowered.charAt(0).toUpperCase() + lowered.slice(1)
}
