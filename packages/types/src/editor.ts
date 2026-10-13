import type { ConceptKey } from './core'
import type { HowToEntry, OntologyStatus } from './ontology'
import type { NounList, PairingType, SourceEntity } from './source'

export type CheckerTokenType =
	| 'Punctuation'
	| 'Note'
	| 'FunctionWord'
	| 'Word'
	| 'Clause'
	| 'Added'
	| 'Phrase'
	| 'Gap'

export type CheckerMessageLabel = 'error' | 'warning' | 'suggest' | 'info'

export type CheckerMessageType = {
	label: CheckerMessageLabel
	severity: number
}

export type CheckerMessage = CheckerMessageType & {
	message: string
	rule_id: string
}

export type CaseFrameStatus = 'unchecked' | 'valid' | 'invalid'

export type CheckStatus = 'ok' | 'error' | 'warning'

export type CheckerCaseFrameInfo = {
	status: CaseFrameStatus
	valid_arguments: Record<string, string>
	extra_arguments: Record<string, string>
	missing_arguments: string[]
	possible_roles: string[]
	required_roles: string[]
}

export type CheckerLookupResult = ConceptKey & {
	form: string
	level: number
	gloss: string
	categorization: string
	ontology_status: OntologyStatus
	how_to_entries: HowToEntry[]
	case_frame: CheckerCaseFrameInfo
}

export type CheckerToken = {
	token: string
	type: CheckerTokenType
	tag: Record<string, string>
	messages: CheckerMessage[]
	applied_rules: string[]
	lookup_results: CheckerLookupResult[]
	pairing: CheckerToken | null
	pairing_type: PairingType | null
	pronoun: CheckerToken | null
	sub_tokens: CheckerToken[]
	auto_fix?: CheckerAutoFix
}

export type CheckerTextInsertion = {
	offset: number
	text: string
}

// A token the checker inserted into the author's text; start/end locate the inserted text within the checked text
export type CheckerAutoFix = {
	message: string
	text: string
	start: number
	end: number
}

//===============
// check API

export type EditorCheckResult = {
	status: CheckStatus
	tokens: CheckerToken[]
	back_translation: string
	// Insertions applied to the submitted text before checking, located by offsets into the submitted text
	auto_fixes?: CheckerTextInsertion[]
}

//===============
// analyze API

export type EditorAnalyzedEntity = Omit<SourceEntity, 'category_abbr' | 'feature_codes'>

export type EditorAnalyzeResult = {
	notes: string[]
	source_entities: EditorAnalyzedEntity[]
	noun_list: NounList
}

//===============
// ai-assist

export type AiAssistResult = {
	status: 'ok' | 'error'
	phase_1: string
	notes: string[]
	check: EditorCheckResult
	message?: string
}
