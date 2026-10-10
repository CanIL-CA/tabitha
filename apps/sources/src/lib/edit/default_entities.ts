import type { PageSourceEntity } from '#lib/types.js'

const defaults: PageSourceEntity = {
	category: '',
	category_abbr: '',
	value: '',
	features: [],
	feature_codes: '',
	noun_list_index: null,
	concept: null,
	pairing_concept: null,
	pairing_type: null,
	id: -1,
	parent_id: -1,
	boundary_category: '',
}

const default_main_clause: PageSourceEntity = {
	...defaults,
	category: 'Clause',
	category_abbr: 'C',
	value: '{',
	features: [
		{ name: 'Type', value: 'Independent' },
	],
	boundary_category: 'C',
}

const default_subordinate_clause: PageSourceEntity = {
	...defaults,
	category: 'Clause',
	category_abbr: 'C',
	value: '[',
	boundary_category: 'C',
}

const default_agent_clause: PageSourceEntity = {
	...default_subordinate_clause,
	features: [
		{ name: 'Type', value: 'Agent (Subject Complement)' },
	],
}

const default_adverbial_clause: PageSourceEntity = {
	...default_subordinate_clause,
	features: [
		{ name: 'Type', value: 'Event Modifier (Adverbial Clause)' },
	],
}

const default_relative_clause: PageSourceEntity = {
	...default_subordinate_clause,
	features: [
		{ name: 'Type', value: 'Restrictive Thing Modifier (Relative Clause)' },
	],
}

const default_patient_clause: PageSourceEntity = {
	...default_subordinate_clause,
	features: [
		{ name: 'Type', value: 'Patient (Object Complement)' },
	],
}

const default_adj_patient_clause: PageSourceEntity = {
	...default_subordinate_clause,
	features: [
		{ name: 'Type', value: 'Attributive Patient (Adjectival Object Complement)' },
	],
}

const default_close_quote_clause: PageSourceEntity = {
	...default_subordinate_clause,
	features: [
		{ name: 'Type', value: 'Closing Quotation Frame' },
	],
}

const default_np: PageSourceEntity = {
	...defaults,
	category: 'Noun Phrase',
	category_abbr: 'NP',
	value: '(',
	features: [
		{ name: 'Semantic Role', value: 'Not Applicable' },
	],
	boundary_category: 'NP',
}

const default_vp: PageSourceEntity = {
	...defaults,
	category: 'Verb Phrase',
	category_abbr: 'VP',
	value: '(',
	boundary_category: 'NP',
}

const default_adjp: PageSourceEntity = {
	...defaults,
	category: 'Adjective Phrase',
	category_abbr: 'AdjP',
	value: '(',
	boundary_category: 'NP',
}

const default_adjp_predicative: PageSourceEntity = {
	...defaults,
	category: 'Adjective Phrase',
	category_abbr: 'AdjP',
	value: '(',
	boundary_category: 'NP',
	features: [
		{ name: 'Usage', value: 'Predicative' },
	],
}

const default_advp: PageSourceEntity = {
	...defaults,
	category: 'Adverb Phrase',
	category_abbr: 'AdvP',
	value: '(',
	boundary_category: 'NP',
}

const default_noun: PageSourceEntity = {
	...defaults,
	category: 'Noun',
	category_abbr: 'N',
	features: [
		{ name: 'Participant Tracking', value: 'Routine' },
		{ name: 'Specificity', value: 'Specific' },
		{ name: 'Person', value: 'Third' },
	],
	concept: { stem: '', sense: '', part_of_speech: 'Noun' },
}

const default_verb: PageSourceEntity = {
	...defaults,
	category: 'Verb',
	category_abbr: 'V',
	features: [
		{ name: 'Time', value: 'Discourse' },
		{ name: 'Aspect', value: 'Unmarked' },
	],
	concept: { stem: '', sense: '', part_of_speech: 'Verb' },
}

const default_adjective: PageSourceEntity = {
	...defaults,
	category: 'Adjective',
	category_abbr: 'Adj',
	concept: { stem: '', sense: '', part_of_speech: 'Adjective' },
}

const default_adverb: PageSourceEntity = {
	...defaults,
	category: 'Adverb',
	category_abbr: 'Adv',
	concept: { stem: '', sense: '', part_of_speech: 'Adverb' },
}

const default_adposition: PageSourceEntity = {
	...defaults,
	category: 'Adposition',
	category_abbr: 'Adp',
	concept: { stem: '', sense: '', part_of_speech: 'Adposition' },
}

const default_conjunction: PageSourceEntity = {
	...defaults,
	category: 'Conjunction',
	category_abbr: 'Con',
	concept: { stem: '', sense: '', part_of_speech: 'Conjunction' },
}

const default_particle: PageSourceEntity = {
	...defaults,
	category: 'Particle',
	category_abbr: 'Par',
	concept: { stem: '', sense: '', part_of_speech: 'Particle' },
}

const default_phrasal: PageSourceEntity = {
	...defaults,
	category: 'Phrasal',
	category_abbr: 'Phr',
	concept: { stem: '', sense: '', part_of_speech: 'Phrasal' },
}

const default_period: PageSourceEntity = {
	...defaults,
	category: 'period',
	category_abbr: 'period',
	value: '.',
}

const default_paragraph: PageSourceEntity = {
	...defaults,
	category: 'Paragraph',
	category_abbr: 'R',
	value: '|',
}

export const DEFAULTS = {
	EMPTY: defaults,
	CLAUSE_MAIN: default_main_clause,
	CLAUSE_SUBORDINATE: default_subordinate_clause,
	CLAUSE_RELATIVE: default_relative_clause,
	CLAUSE_AGENT: default_agent_clause,
	CLAUSE_PATIENT: default_patient_clause,
	CLAUSE_ADVERBIAL: default_adverbial_clause,
	CLAUSE_ADJ_PATIENT: default_adj_patient_clause,
	CLAUSE_CLOSE_QUOTE: default_close_quote_clause,
	NOUN_PHRASE: default_np,
	VERB_PHRASE: default_vp,
	ADJECTIVE_PHRASE: default_adjp,
	ADJECTIVE_PHRASE_PREDICATIVE: default_adjp_predicative,
	ADVERB_PHRASE: default_advp,
	NOUN: default_noun,
	VERB: default_verb,
	ADJECTIVE: default_adjective,
	ADVERB: default_adverb,
	ADPOSITION: default_adposition,
	CONJUNCTION: default_conjunction,
	PHRASAL: default_phrasal,
	PARTICLE: default_particle,
	PERIOD: default_period,
	PARAGRAPH: default_paragraph,
}