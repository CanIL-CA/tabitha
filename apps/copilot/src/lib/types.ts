import type { VerseReference, SourceSimpleJsonEntity } from '@tabitha/types'
import type { CopilotTriggerData, CopilotDiscernResult, CopilotResult } from '@tabitha/types/copilot'

export type ChapterReference = Pick<VerseReference, 'book' | 'chapter'>

export type CopilotMode = 'discern' | 'brief'

export type MttLevel = 'grade5' | 'high_school' | 'undergraduate'

export type ProfileCustomCombination = {
	name: string
	flags: Record<string, string[]>
	weight: number
	prompt: string
}

type ContrastiveGrouping = string[][]

export type LanguageProfile = {
	multiple_past: boolean
	multiple_future: boolean
	noun_number: string[]
	noun_proximity: ContrastiveGrouping
	noun_clusivity: boolean
	as_third_handling: 'third' | 'first_second' | 'apposition'

	modifier_degree: ContrastiveGrouping

	passive: 'none' | 'agent_forbidden' | 'agent_allowed' | 'other'
	rhetorical_questions: boolean
	honorifics: boolean
	speech_formula_position: 'before' | 'after' | 'both' | 'either'

	custom_weights?: Record<string, Record<string, number>>
	custom_combinations?: ProfileCustomCombination[]
}

export type CopilotNoteSettings = {
	language_profile: LanguageProfile
	lwc: string
	mtt_level: MttLevel
	sensitivity: number
	mode: CopilotMode
}

export type CopilotDisplaySettings = {
	show_note_sources: boolean
	show_english: boolean
}

export type CopilotSettings = CopilotNoteSettings & CopilotDisplaySettings

export type TriggerIdData = {
	name: string
	node_id: string
}

export type TriggerDataForLlm = CopilotTriggerData & {
	prompt?: string
}

export type CopilotLlmInput = {
	verse: string
	output_language: string
	prose_level: MttLevel
	tbta_encoding: string
	english_text: string
	lwc_text?: string
	triggers: TriggerDataForLlm[]
}

export type CopilotLlmNote = {
	meaning: string
	check: string
	quoted_text: string
	trigger: TriggerIdData
}

export type CopilotLlmOutput = {
	notes: CopilotLlmNote[]
	lwc_text?: string
}

export type FlagWeightingMap = Record<string, Record<string, number>>

//===============
// encoding parsing and flag extraction

export type IndexStack = number[]

export type CopilotEncodingEntity = Omit<SourceSimpleJsonEntity, 'children' | 'target'> & {
	children?: CopilotEncodingEntity[]
	node_id?: string
}

export type EntityMatchCapture = {
	node: CopilotEncodingEntity
	indexStack: IndexStack
}

export type EntityMatch = {
	success: boolean
	bindings: Record<string, unknown>
	captures: Record<string, EntityMatchCapture>
}

export type FlagExtractionLayer = {
	value: string | ((match: EntityMatch) => string | undefined) | undefined
	pattern: PatternEntity
	anchor_extra?: (match: EntityMatch) => Record<string, string>
	comment?: string
}

export type FlagExtractionRule = {
	flag: string
	rules: FlagExtractionLayer[]
}

export type PatternEntity = CopilotEncodingEntity & {
	name?: string
	optional?: boolean
	category?: string
	children?: PatternEntity[]
}

export type EntityMatchResult = EntityMatch & {
	flag: string
	rule: FlagExtractionLayer
}

//===============
// Brief types

export type BriefSettings = CopilotSettings & {
	rigor: BriefRigorMode
	output_format: BriefOutputFormat
	output_style: BriefOutputStyle
}

// The single-verse endpoint streams one of these per stage before its final result line.
export type CopilotStep = 'notes' | 'aquifer' | 'brief' | 'translate'
export type CopilotStepUpdate = { type: 'step', step: CopilotStep }
export type CopilotStreamLine = CopilotStepUpdate | CopilotResult

export type BriefRigorMode = 'HIGH' | 'LOW'
export type BriefOutputFormat = 'usfm' // TODO | 'docx' | 'pdf'
export type BriefOutputStyle = 'production' // TODO | 'verbose'

export type BriefInput = {
	verse: VerseReference
	settings: BriefSettings
	notes_result: CopilotDiscernResult
}

// This type matches the brief's 'json_response_schema' that the LLM returns,
// so it should not change unless the prompt or schema changes.
export type BriefTnnBasedOutput = {
	section4: {
		// SIL Translator Notes
		notes: { text: string }[]
	}
	section5: {
		// Cultural context summary
		cultural: {
			term: string
			summary: string
		}[]
		background: {
			term: string
			summary: string
		}[]
	}
	section7: {
		// Consultant note candidates
		decisions: {
			status: 'RESOLVED UPSTREAM' | 'CONFLICT' | 'UNRESOLVED'
			text: string
		}[]
	}
}
