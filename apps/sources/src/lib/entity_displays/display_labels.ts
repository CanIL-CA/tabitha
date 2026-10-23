import type { PageSourceEntity } from '#lib/types.ts'
import { view_settings } from '#lib/settings/settings.svelte.js'

const LABEL_MAP: [[string, string, string | ((value: string) => boolean)], string][] = [
	[['Clause', 'Location', 'Discourse Title'], '(title)'],
	[['Clause', 'Location', value => value.includes('Footnote')], '(footnote)'],
	[['Clause', 'Alternative Analysis', 'Literal Alternate'], '(literal)'],
	[['Clause', 'Alternative Analysis', 'Dynamic Alternate'], '(dynamic)'],
	[['Clause', 'Alternative Analysis', 'Biblical Units'], '(biblical-units)'],
	[['Clause', 'Alternative Analysis', 'Contemporary Units'], '(modern-units)'],
	[['Clause', 'Alternative Analysis', 'Primary Analysis'], '(primary)'],
	[['Clause', 'Alternative Analysis', 'First Alternative Analysis'], '(alternate-1)'],
	[['Clause', 'Alternative Analysis', 'Second Alternative Analysis'], '(alternate-2)'],
	[['Clause', 'Alternative Analysis', 'Third Alternative Analysis'], '(alternate-3)'],
	[['Clause', 'Alternative Analysis', 'Fourth Alternative Analysis'], '(alternate-4)'],
	[['Clause', 'Alternative Analysis', 'Fifth Alternative Analysis'], '(alternate-5)'],
	[['Clause', 'Vocabulary Alternate', value => value.includes('Complex')], '(complex)'],
	[['Clause', 'Vocabulary Alternate', value => value.includes('Simple')], '(simple)'],
	[['Clause', 'Rhetorical Question', value => value.includes("'Yes'")], '(yes-rhetorical)'],
	[['Clause', 'Rhetorical Question', value => value.includes("'No'")], '(no-rhetorical)'],
	[['Clause', 'Rhetorical Question', 'Equivalent Statement'], '(statement)'],
	[['Clause', 'Rhetorical Question', 'Content Rhetorical Question'], '(rhetorical)'],
	[['Clause', 'Implicit Information', value => value.includes('Implicit')], '(implicit)'],
	[['Noun Phrase', 'Implicit', 'Explanation of Name'], '(explain-name)'],
	[['Noun Phrase', 'Implicit', value => value.includes('Metonymy')], '(metonymy)'],
	[['Noun Phrase', 'Implicit', value => !['Not Applicable', 'Explanation of Name'].includes(value) && !value.includes('Metonymy')], '(implicit)'],
	[['Verb Phrase', 'Implicit', 'Yes'], '(implicit)'],
	[['Adjective Phrase', 'Implicit', 'Yes'], '(implicit)'],
	[['Adverb Phrase', 'Implicit', 'Yes'], '(implicit)'],
]

export function get_display_labels(entity: PageSourceEntity): string[] {
	if (!view_settings.show_boundary_labels) {
		return []
	}

	const labels: string[] = []
	for (const [[, feature_name, value_check], label] of LABEL_MAP.filter(([[category]]) => category === entity.category)) {
		const feature_value = entity.features.find(f => f.name === feature_name)?.value ?? ''
		if (typeof value_check === 'string' ? value_check === feature_value : value_check(feature_value)) {
			labels.push(label)
		}
	}
	return labels
}