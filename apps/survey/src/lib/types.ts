import type { SurveyDefinition, SurveyItem, SurveyOutput } from '@tabitha/types/survey'

/** The parts of a SurveyDefinition reviewers may see. */
export type ReviewDefinition = Pick<SurveyDefinition, 'title' | 'description' | 'instructions' | 'rubric'>

/** The parts only the results page shows, since `output_names` reveals which output is which. */
export type ResultsDefinition = Pick<SurveyDefinition, 'output_names'> & {
	results_stats: NonNullable<SurveyDefinition['results_stats']>
}

/** An item as reviewers see it: outputs already in A/B order, and nothing results-only. */
export type ReviewItem = Omit<SurveyItem, 'outputs' | 'results_notes'> & {
	outputs: { a: SurveyOutput, b: SurveyOutput }
}

export type Side = 'a' | 'b'

export type ReviewResponse = {
	item_key: string
	/** Positive leans toward A, negative toward B, 0 is no preference, null is not answered yet. */
	preference: number | null
	issues: Record<Side, string[]>
	comment: string
}
