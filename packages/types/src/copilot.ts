import type { VerseReference } from './reference'

export type CopilotEncodingFlag = {
	name: string
	value: string
	encoding_anchor: {
		[key: string]: string
		node_id: string
	}
	weight: number
}

export type CopilotTriggerData = {
	name: string
	node_id: string
	flags: CopilotEncodingFlag[]
	weight: number
}

export type CopilotNote = {
	meaning: string
	check: string
	quoted_text: string
	trigger: CopilotTriggerData
}

export type CopilotResultType = 'discern' | 'brief' | 'error'

export type CopilotErrorResult = {
	type: 'error'
	verse: VerseReference
	error: string
	// False when trying again would fail the same way (missing text, a safety rejection, bad
	// credentials). Absent means worth retrying, which is also what a failure nobody classified is.
	retryable?: false
}

export type CopilotDiscernResult = {
	type: 'discern'
	verse: VerseReference
	english_text: string
	lwc_text?: string
	notes: CopilotNote[]
}

export type CopilotBriefResult = {
	type: 'brief'
	verse: VerseReference
	lwc_text: string
	semantic_notes: CopilotNote[]
	// false when Aquifer has no translator notes for the verse, leaving the TNN-based sections empty
	tnn_available: boolean
	tnn_notes: string[]
	cultural_background: {
		term: string
		summary: string
	}[]
	image_keywords: string[]
	consultant_decisions: {
		status: string
		text: string
	}[]
}

export type CopilotResult = CopilotDiscernResult | CopilotBriefResult | CopilotErrorResult

export type CopilotBriefSection = 'semantic_notes' | 'tnn_notes' | 'cultural_background' | 'image_keywords' | 'consultant_decisions'

export type CopilotBriefHeadingsResult = Record<CopilotBriefSection, string>