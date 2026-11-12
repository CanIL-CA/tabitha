import { CheckerToken } from './editor'
import { SourceEntity } from './source'

export type EditorAnalyzedEntity = Omit<SourceEntity, 'category_abbr' | 'feature_codes'>

export type EditorAnalyzeResult = {
	status: AnalyzerStatus
	tokens: CheckerToken[]
	source_entities: EditorAnalyzedEntity[]
}

export type AnalyzerStatus = 'ok' | 'error'

export type AnalysisResult = {
	status: AnalyzerStatus
	tokens: CheckerToken[]
	source_entities: SourceEntity[]
}