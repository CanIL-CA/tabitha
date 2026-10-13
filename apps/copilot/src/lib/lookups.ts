import type { CopilotBriefSection } from '@tabitha/types/copilot'
import type { CopilotSettings, MttLevel, CopilotMode, BriefRigorMode } from '#lib/types.js'

export const book_rigors = new Map<string, BriefRigorMode>([
	['Genesis', 'LOW'],
	['Ruth', 'LOW'],
	['1 Samuel', 'LOW'],
	['2 Samuel', 'LOW'],
	['Daniel', 'LOW'],
	['Jonah', 'LOW'],
	['Matthew', 'HIGH'],
	['Mark', 'HIGH'],
	['Luke', 'HIGH'],
	['John', 'LOW'],
	['Acts', 'HIGH'],
	['Titus', 'HIGH'],
	['1 Peter', 'LOW'],
	['2 Peter', 'LOW'],
	['1 John', 'HIGH'],
	['2 John', 'LOW'],
	['3 John', 'LOW'],
	['Jude', 'LOW'],
])

export const polished_books = book_rigors.keys().toArray()

type LwcInfo = {
	code: string
	no_notes_text?: string
	no_tnn_text?: string
}
export const lwc_info: Record<string, LwcInfo> = {
	'English': {
		code: 'ENG',
		no_notes_text: 'No notes for this verse based on the TBTA analysis.',
		no_tnn_text: 'No Aquifer translator notes are available for this verse.',
	},
	// 'French': {
	// 	code: 'FRE',
	// 	no_notes_text: "Aucune suggestion pour ce verset d'après l'analyse TBTA.",
	// },
	'Indonesian': {
		code: 'IND',
		no_notes_text: 'Tidak ada saran untuk ayat ini berdasarkan analisis TBTA.',
	},
	// 'Russian': {
	// 	code: 'RUS',
	// 	no_notes_text: 'Для этого стиха нет предложений на основе анализа TBTA.',
	// },
	'Swahili': {
		code: 'SWA',
		no_notes_text: 'Hakuna mapendekezo ya mstari huu kulingana na uchambuzi wa TBTA.',
	},
	'Tagalog': {
		code: 'TAG',
		no_notes_text: 'Walang mungkahi para sa talatang ito batay sa pagsusuri ng TBTA.',
	},
}

export const default_target_audience: Record<string, string> = {
	'English': 'Unchurched Adults',
	'Indonesian': 'Unchurched Adults',
	'Swahili': 'All Helps',
	'Tagalog': 'Unchurched Adults',
}

type MttLevelInfo = {
	code: string
}
export const mtt_level_info: Record<MttLevel, MttLevelInfo> = {
	'grade5': { code: 'Direct' },
	'high_school': { code: 'Detailed' },
	'undergraduate': { code: 'Technical' },
}

export const copilot_modes: CopilotMode[] = [
	'brief',
	'discern',
]

export const default_settings: CopilotSettings = {
	language_profile: {
		multiple_past: false,
		multiple_future: false,
		noun_number: [],
		noun_proximity: [],
		noun_clusivity: false,
		as_third_handling: 'apposition',

		modifier_degree: [],

		passive: 'agent_allowed',
		rhetorical_questions: true,
		honorifics: false,
		speech_formula_position: 'before',

		custom_weights: {},
		custom_combinations: [],
	},
	mtt_level: 'high_school',
	lwc: 'English',
	sensitivity: 1,
	show_english: true,
	show_note_sources: false,
	mode: 'brief',
}

export function get_no_notes_text(lwc: string) {
	return lwc_info[lwc].no_notes_text || lwc_info['English'].no_notes_text!
}

export function get_no_tnn_text({ lwc, tnn_available }: { lwc: string, tnn_available: boolean }) {
	if (tnn_available) return 'No translator notes remained for this verse after filtering.'
	return lwc_info[lwc].no_tnn_text || lwc_info['English'].no_tnn_text!
}

export const BRIEF_HEADINGS_ENGLISH: Record<CopilotBriefSection, string> = {
	'semantic_notes': 'TaBiThA SEMANTIC NOTES',
	'tnn_notes': 'SIL TRANSLATOR NOTES',
	'cultural_background': 'CULTURAL & CONTEXTUAL BACKGROUND',
	'image_keywords': 'IMAGE KEYWORDS',
	'consultant_decisions': 'CONSULTANT DECISION',
}