import type { FlagWeightingMap } from '$lib/types'

export const default_flag_weights_for_discern: FlagWeightingMap = {
	'Verb Time': {
		'Historic Past': 2,
		'Eternity Past': 3,
		'Unknown Past': 3,
		'Unknown Future': 3,
	},
	'Verb Aspect': {
		'Inceptive': 3,
		'Completive': 3,
		'Cessative': 3,
		'Continuative': 5,
		'Imperfective': 0,
		'Routine': 3,
		'Gnomic': 5,
	},
	'Verb Mood': {
		'Definite Potential': 5,
		'Probable Potential': 5,
		"'might' Potential": 5,
	},
	'Verb Polarity': {
		'Negative': 1,
		'Emphatic Affirmative': 5,
		'Emphatic Negative': 5,
	},
	'Noun Person': {
		'First as Third': 3,
		'Second as Third': 3,
		'First Inclusive as Third': 3,
		'First Exclusive as Third': 3,
	},
	'Noun Participant Status': {
		'Significant Location': 3,
		'Significant Time': 3,
		'Emphasized': 5,
	},
	'Modifier Degree': {
		'Comparative': 1,
		'Superlative': 2,
		'Intensified': 1,
		'Extremely Intensified': 5,
		"'too'": 5,
		"'less'": 1,
		"'least'": 5,
		'Equality': 5,
		'Intensified Comparative': 5,
		"Intensified 'less'": 5,
		'Superlative of 2 items': 2,
	},
	'Emphasized Agent of Imperative': {
		'*': 4,
	},
	'Speaker Attitude': {
		'Anger': 4,
	},
	'Explanation of Name': {
		'*': 5,
	},
	'Metonymy': {
		'*': 5,
	},
	'Intent/Result': {
		'Intent': 2,
		'Logical Consequence': 1,
		'Simple Result': 0,
	},
	'Means/Reason': {
		'Means': 1,
		'Reason': 0,
	},
	'Metaphor': {
		'*': 5,
	},
	'Rhetorical Question': {
		'Equivalent Statement': 0,
		'*': 5,
	},
	'Vocabulary Alternate': {
		'*': 5,
	},
}

export const default_flag_weights_for_brief: FlagWeightingMap = {
	'Verb Time': {
		'Historic Past': 2,
		'Eternity Past': 3,
		'Unknown Past': 3,
		'Unknown Future': 3,
	},
	'Verb Aspect': {
		'Inceptive': 1,
		'Completive': 2,
		'Cessative': 2,
		'Continuative': 2,
		'Imperfective': 0,
		'Routine': 3,
		'Gnomic': 4,
	},
	'Verb Mood': {
		'Definite Potential': 5,
		'Probable Potential': 5,
		"'might' Potential": 5,
	},
	'Verb Polarity': {
		'Negative': 0,
		'Emphatic Affirmative': 5,
		'Emphatic Negative': 5,
	},
	'Noun Person': {
		'First as Third': 5,
		'Second as Third': 5,
		'First Inclusive as Third': 5,
		'First Exclusive as Third': 5,
	},
	'Noun Participant Status': {
		'Significant Location': 3,
		'Significant Time': 3,
		'Emphasized': 5,
	},
	'Modifier Degree': {
		'Extremely Intensified': 5,
		"'too'": 5,
		"'least'": 5,
		'Intensified Comparative': 5,
		"Intensified 'less'": 5,
	},
	'Emphasized Agent of Imperative': {
		'*': 4,
	},
	'Speaker Attitude': {
		'Anger': 4,
	},
	'Explanation of Name': {
		'*': 5,
	},
	'Metonymy': {
		'*': 5,
	},
	'Metaphor': {
		'*': 5,
	},
	'Rhetorical Question': {
		'Equivalent Statement': 0,
		'*': 5,
	},
	'Vocabulary Alternate': {
		'*': 5,
	},
}