import type { CopilotBriefSection } from '@tabitha/types/copilot'
import type { CopilotSettings, MttLevel, CopilotMode } from '$lib/types'

export const polished_books = [
	'Genesis',
	// 'Joshua',
	'Ruth',
	// '1 Samuel',
	// '2 Samuel',
	// 'Nehemiah',
	// 'Esther',
	'Daniel',
	'Jonah',
	// 'Nahum',
	'Matthew',
	'Mark',
	'Luke',
	'John',
	'Acts',
	'Titus',
	// 'Philemon',
	'1 Peter',
	'2 Peter',
	'1 John',
	'2 John',
	'3 John',
	'Jude',
]

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
	// 'Afrikaans': {
	// 	code: 'AFR',
	// },
	// 'Arabic': {
	// 	code: 'ARB',
	// 	// no_notes_text: 'بحسب تحليل TBTA، فإن هذه الفقرة لا تقدم أي نصيحة.',
	// },
	// 'Cebuano': {
	// 	code: 'CEB',
	// 	// no_notes_text: 'Walay mga sugyot para niini nga bersikulo base sa pagtuki sa TBTA.',
	// },
	// 'French': {
	// 	code: 'FRE',
	// 	no_notes_text: "Aucune suggestion pour ce verset d'après l'analyse TBTA.",
	// },
	// 'Hindi': {
	// 	code: 'HIN',
	// 	// no_notes_text: 'TBTA एनालिसिस के आधार पर इस श्लोक के लिए कोई सुझाव नहीं है',
	// },
	'Indonesian': {
		code: 'IND',
		no_notes_text: 'Tidak ada saran untuk ayat ini berdasarkan analisis TBTA.',
	},
	// 'Malayalam': {
	// 	code: 'MAL',
	// },
	// 'Mandarin': {
	// 	code: 'MAN',
	// 	// no_notes_text: '根据TBTA分析，这节经文没有建议。',
	// },
	// 'Portugese (Br)': {
	// 	code: 'POR',
	// 	// no_notes_text: 'Nenhuma sugestão para este versículo com base na análise TBTA.',
	// },
	// 'Russian': {
	// 	code: 'RUS',
	// 	no_notes_text: 'Для этого стиха нет предложений на основе анализа TBTA.',
	// },
	// 'Spanish': {
	// 	code: 'SPA',
	// 	// no_notes_text: 'No hay sugerencias para este versículo según el análisis de TBTA.',
	// },
	'Swahili': {
		code: 'SWA',
		no_notes_text: 'Hakuna mapendekezo ya mstari huu kulingana na uchambuzi wa TBTA.',
	},
	'Tagalog': {
		code: 'TAG',
		no_notes_text: 'Walang mungkahi para sa talatang ito batay sa pagsusuri ng TBTA.',
	},
	// 'Tamil': {
	// 	code: 'TAM',
	// },
	// 'Tok Pisin': {
	// 	code: 'TKP',
	// 	no_notes_text: 'Nogat tingting long dispela ves bihainim TBTA analisis.',
	// },
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
	'grade5': { code: 'G5' },
	'high_school': { code: 'HS' },
	'undergraduate': { code: 'UG' },
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