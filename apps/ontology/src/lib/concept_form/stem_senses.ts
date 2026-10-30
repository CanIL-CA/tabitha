import { get_stem_senses } from '#lib/changes/changes.js'
import { check_for_unsynced_senses } from '#lib/offline/pending.js'
import type { StemSense, StemSensesResult } from '#lib/types.js'

type CombineStemSensesOptions = {
	readonly stem: string
	readonly server_senses: StemSense[]
	readonly unsynced_senses: StemSense[]
	// a suggested create being edited, so it isn't counted as a sense competing with itself
	readonly excluded_change_id?: number
}

const FIRST_SENSE_CODE = 'A'.charCodeAt(0)

export const EMPTY_STEM_SENSES: StemSensesResult = { stem: '', senses: [], next_sense: '', has_pending_create: false }

// the letter after the highest one in use, so a new concept never reuses a sense that's still waiting to be added
export const next_sense_after = (senses: StemSense[]): string => {
	const highest_code = Math.max(FIRST_SENSE_CODE - 1, ...senses.map(({ sense }) => sense.charCodeAt(0)))
	return String.fromCharCode(highest_code + 1)
}

export const combine_stem_senses = ({ stem, server_senses, unsynced_senses, excluded_change_id }: CombineStemSensesOptions): StemSensesResult => {
	const senses = [...server_senses, ...unsynced_senses]
		.filter(({ change_id }) => change_id === undefined || change_id !== excluded_change_id)
		.toSorted((a, b) => a.sense.localeCompare(b.sense))
	return {
		stem, 
		senses,
		next_sense: next_sense_after(senses),
		has_pending_create: senses.some(({ status }) => status !== 'in ontology'),
	}
}

type LookUpStemSensesOptions = {
	readonly stem: string
	readonly part_of_speech: string
	readonly excluded_change_id?: number
}

export async function look_up_stem_senses({ stem, part_of_speech, excluded_change_id }: LookUpStemSensesOptions): Promise<StemSensesResult> {
	const [server_senses, unsynced_senses] = await Promise.all([
		get_stem_senses({ stem, part_of_speech }),
		check_for_unsynced_senses({ stem, part_of_speech }),
	])
	return combine_stem_senses({ stem, server_senses, unsynced_senses, excluded_change_id })
}
