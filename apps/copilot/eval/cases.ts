import { default_settings } from '#lib/lookups.js'
import type { VerseReference } from '@tabitha/types'
import type { CopilotSettings } from '#lib/types.js'

export type EvalCase = {
	id: string
	reference: VerseReference
	settings: CopilotSettings
	// Why this verse is in the set, shown to reviewers.
	note: string
}

type CaseSpec = {
	ref: string
	lwc?: string
	mode?: CopilotSettings['mode']
	mtt_level?: CopilotSettings['mtt_level']
	note: string
}

// Brief mode in English is the bulk, since it is the costliest call. Indonesian covers the
// translate step and lwc_text citing (its ideal texts exist for Acts 1-4 and Luke 10-11), and
// discern mode at grade 5 covers the semantic-notes call on its own.
const CASE_SPECS: CaseSpec[] = [
	{ ref: 'Genesis 1:1', note: 'small encoding, 3 triggers' },
	{ ref: 'Genesis 3:15', note: 'largest encoding measured (27k chars), no triggers' },
	{ ref: 'Genesis 22:2', note: 'narrative with a command and a place name' },
	{ ref: 'Ruth 1:16', note: 'large encoding, no triggers' },
	{ ref: 'Ruth 3:9', note: 'cultural idiom (spread your garment)' },
	{ ref: '1 Samuel 3:10', note: 'repeated vocative, dialogue' },
	{ ref: '2 Samuel 7:12', note: 'future promise, kinship terms' },
	{ ref: 'Daniel 6:10', note: 'habitual action, cultural practice' },
	{ ref: 'Jonah 1:3', note: 'place names, travel' },
	{ ref: 'Matthew 5:3', note: '3 triggers, beatitude' },
	{ ref: 'Matthew 6:9', note: 'prayer, honorific address' },
	{ ref: 'Mark 1:15', note: 'key terms (kingdom, repent)' },
	{ ref: 'Mark 10:45', note: 'theological key terms (ransom)' },
	{ ref: 'Luke 1:1', note: 'book verse 1: Aquifer sends the whole book introduction' },
	{ ref: 'Luke 15:20', note: 'parable, emotion and gesture' },
	{ ref: 'John 1:1', note: 'abstract key term (Word)' },
	{ ref: 'John 3:16', note: 'well-known verse, key terms' },
	{ ref: 'Acts 10:9', note: 'no Aquifer notes for Acts' },
	{ ref: 'Titus 2:11', note: 'abstract nouns (grace)' },
	{ ref: 'Titus 3:5', note: 'theological terms (regeneration)' },
	{ ref: '1 Peter 1:3', note: 'very large encoding, long sentence' },
	{ ref: '1 Peter 5:7', note: 'idiom (cast your anxiety)' },
	{ ref: '2 Peter 1:3', note: 'abstract terms' },
	{ ref: '1 John 1:9', note: 'conditional' },
	{ ref: 'Jude 1:3', note: 'small book, epistolary opening' },
	{ ref: 'Luke 10:25', lwc: 'Indonesian', note: 'Indonesian: dialogue, legal term' },
	{ ref: 'Luke 11:1', lwc: 'Indonesian', note: 'Indonesian: 1 trigger, measured verse' },
	{ ref: 'Luke 11:9', lwc: 'Indonesian', note: 'Indonesian: imperatives' },
	{ ref: 'Acts 1:8', lwc: 'Indonesian', note: 'Indonesian: no Aquifer notes, place names' },
	{ ref: 'Acts 2:38', lwc: 'Indonesian', note: 'Indonesian: key terms (repent, baptize)' },
	{ ref: 'Genesis 1:1', mode: 'discern', mtt_level: 'grade5', note: 'semantic notes only, grade 5' },
	{ ref: 'Matthew 5:3', mode: 'discern', mtt_level: 'grade5', note: 'semantic notes only, grade 5' },
	{ ref: 'Titus 2:11', mode: 'discern', mtt_level: 'grade5', note: 'semantic notes only, grade 5' },
]

export const EVAL_CASES: EvalCase[] = CASE_SPECS.map(to_eval_case)

function to_eval_case({ ref, lwc = 'English', mode = 'brief', mtt_level = default_settings.mtt_level, note }: CaseSpec): EvalCase {
	const reference = parse_reference(ref)
	const settings: CopilotSettings = { ...default_settings, lwc, mode, mtt_level }
	return { id: case_id({ reference, settings }), reference, settings, note }
}

function parse_reference(ref: string): VerseReference {
	const match = /^(.+) (\d+):(\d+)$/.exec(ref)
	if (!match) throw new Error(`Bad eval reference "${ref}"`)
	const [, book, chapter, verse] = match
	return { book, chapter: Number(chapter), verse: Number(verse) }
}

function case_id({ reference, settings }: Pick<EvalCase, 'reference' | 'settings'>): string {
	const { book, chapter, verse } = reference
	return [book, chapter, verse, settings.lwc, settings.mode, settings.mtt_level].join('-').toLowerCase().replaceAll(' ', '_')
}
