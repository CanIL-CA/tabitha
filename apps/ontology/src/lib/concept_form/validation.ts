import type { ConceptCreateData, ValidationResult } from '#lib/types.js'

type FieldRule = {
	field: keyof ConceptCreateData
	message: string
	is_violated_by: (concept: ConceptCreateData) => boolean
}

const ERROR_RULES: FieldRule[] = [
	{
		field: 'stem',
		message: 'A stem cannot contain spaces',
		is_violated_by: ({ stem }) => /\s/.test(stem),
	},
	{
		field: 'categories',
		message: "Cannot have multiple usages set to 'Always'",
		is_violated_by: ({ categories }) => categories.filter(cat => cat.startsWith('always')).length > 1,
	},
]

const WARNING_RULES: FieldRule[] = [
	{
		field: 'stem',
		message: "Did you include the sense letter? It's added automatically",
		is_violated_by: ({ stem }) => /-[A-Z]$/.test(stem),
	},
]

type FieldMessages = ValidationResult['errors']

function issues_violated_by({ rules, concept }: { rules: FieldRule[], concept: ConceptCreateData }): FieldMessages {
	return rules.filter(rule => rule.is_violated_by(concept))
		.reduce<FieldMessages>((messages, { field, message }) => ({
			...messages,
			[field]: [...messages[field] ?? [], message],
		}), {})
}

export function validate_concept(concept: ConceptCreateData): ValidationResult {
	return {
		errors: issues_violated_by({ rules: ERROR_RULES, concept }),
		warnings: issues_violated_by({ rules: WARNING_RULES, concept }),
	}
}
