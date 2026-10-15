// The file a publisher hands to apps/survey's `bun run publish`. Reviewers compare two outputs
// per item without knowing which is which: `outputs` is in the publisher's order, and publishing
// decides per item which one shows as A.

export type SurveyDefinition = {
	title: string
	/** Shown under the title on every page. */
	description: string
	/** The "How to review" list reviewers see before they start. */
	instructions: string[]
	/** What each of the two outputs is, in `outputs` order. Shown only on the results page. */
	output_names: [string, string]
	rubric: SurveyRubric
	/** Figures the publisher already knows (cost, timing), shown only on the results page. */
	results_stats?: SurveyStat[]
	items: SurveyItem[]
}

export type SurveyRubric = {
	/** The preference question, e.g. "Which would you rather hand to the translator?" */
	question: string
	/** An odd number of choices, from "A is clearly better" to "B is clearly better", with the
	 * middle one meaning no preference. */
	scale: SurveyScaleChoice[]
	/** Problems a reviewer can tick for each output. */
	issues: SurveyIssue[]
	comment_placeholder: string
}

export type SurveyScaleChoice = {
	label: string
	/** A compact form for narrow buttons, e.g. "A ≫". */
	short: string
}

export type SurveyIssue = {
	key: string
	label: string
}

export type SurveyStat = {
	label: string
	value: string
	detail?: string
}

export type SurveyItem = {
	/** Unique within the survey and stable across republishes, e.g. an eval case id. */
	key: string
	title: string
	chips: string[]
	/** Why this item is in the set. */
	note?: string
	context: SurveyContextBlock[]
	outputs: [SurveyOutput, SurveyOutput]
	/** Automatic findings about this item, shown only on the results page. */
	results_notes?: string[]
}

export type SurveyContextBlock = {
	label: string
	text: string
}

export type SurveyOutput = SurveyOutputSections | SurveyOutputError

export type SurveyOutputSections = {
	sections: SurveySection[]
}

export type SurveyOutputError = {
	error: string
}

export type SurveySection = {
	title: string
	entries: SurveyEntry[]
	/** Shown when `entries` is empty. */
	empty: string
}

/** One list entry: its parts render as separate lines. */
export type SurveyEntry = SurveyEntryPart[]

export type SurveyEntryPart = {
	text: string
	style?: 'strong' | 'quote' | 'code' | 'label'
}
