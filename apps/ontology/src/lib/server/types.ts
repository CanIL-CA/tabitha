import type { OntologyChangeAction, UserEmail } from '#lib/types.js'
import type { PartOfSpeech } from '@tabitha/types'

export type Permission = 'PROTECTED_ACCESS' | 'ADD_CONCEPT' | 'UPDATE_CONCEPT' | 'DELETE_CONCEPT'

export type DbOntologyChange = {
	id: number
	concept_stem: string
	concept_sense: string
	concept_part_of_speech: PartOfSpeech
	data: string
	action: OntologyChangeAction
	suggested_by_email: UserEmail | null
	suggested_date: string | null
	approved_by_email: UserEmail | null
	approved_date: string | null
	applied_date: string | null
	version: string | null
}
