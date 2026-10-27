// the first label for each level is the default that gloss_labels.ts applies when the level changes
export const level_gloss_labels: Record<string, string[]> = {
	'0': ['(universal primitive)'],
	'1': ['(simple)', '(LDV)'],
	'2': ['(complex)'],
	'3': ['(complex alternate)'],
	'4': ['(proper name)', '(inexplicable)', '(key term)', '(biblical unit)'],
}

const all_gloss_labels = Object.values(level_gloss_labels).flat()

export const find_leading_gloss_label = (gloss: string): string | undefined => {
	const trimmed_gloss = gloss.trimStart()
	return all_gloss_labels.find(label => trimmed_gloss.startsWith(label))
}

export const apply_gloss_label = ({ gloss, label }: { gloss: string, label: string }): string => {
	const trimmed_gloss = gloss.trimStart()
	const leading_label = find_leading_gloss_label(trimmed_gloss) ?? ''
	const description = trimmed_gloss.slice(leading_label.length).trimStart()
	return `${label} ${description}`
}

export const relabel_gloss_for_level = ({ gloss, level }: { gloss: string, level: string }): string => {
	const default_label = level_gloss_labels[level]?.[0]
	if (!default_label) return gloss

	return apply_gloss_label({ gloss, label: default_label })
}
