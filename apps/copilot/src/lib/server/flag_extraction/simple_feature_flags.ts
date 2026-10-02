import type { FlagExtractionRule } from '$lib/types'

export const simple_feature_flags: FlagExtractionRule[] = [
	{
		flag: 'Verb Time',
		rules: [{
			value: '$time',
			pattern: {
				name: '$anchor',
				category: 'Verb',
				concept: '$concept',
				features: {
					'Time': '$time',
				},
			},
		}],
	},
	{
		flag: 'Verb Aspect',
		rules: [{
			value: '$aspect',
			pattern: {
				name: '$anchor',
				category: 'Verb',
				concept: '$concept',
				features: {
					'Aspect': '$aspect',
				},
			},
		}],
	},
	{
		flag: 'Verb Mood',
		rules: [{
			value: '$mood',
			pattern: {
				name: '$anchor',
				category: 'Verb',
				concept: '$concept',
				features: {
					'Mood': '$mood',
				},
			},
		}],
	},
	{
		flag: 'Verb Polarity',
		rules: [{
			value: '$polarity',
			pattern: {
				name: '$anchor',
				category: 'Verb',
				concept: '$concept',
				features: {
					'Polarity': '$polarity',
				},
			},
		}],
	},
	{
		flag: 'Noun Number',
		rules: [{
			comment: 'If the noun is already modified by a number, do not flag it as Dual/Trial/Quadrial',
			value: match => match.captures['$numeral'] ? undefined : (match.bindings['$number'] as string | undefined),
			pattern: {
				category: 'Noun Phrase',
				children: [
					{
						name: '$anchor',
						category: 'Noun',
						concept: '$concept',
						features: {
							'Number': '$number',
							'Noun List Index': '$noun_index',
						},
					},
					{
						optional: true,
						category: 'Adjective Phrase',
						children: [{
							name: '$numeral',
							category: 'Adjective',
							concept: '2-A|3-A|4-A',
						}],
					},
				],
			},
		}],
	},
	{
		flag: 'Noun Person',
		rules: [{
			value: '$person',
			pattern: {
				name: '$anchor',
				category: 'Noun',
				concept: '$concept',
				features: {
					'Person': '$person',
					'Noun List Index': '$noun_index',
				},
			},
		}],
	},
	{
		flag: 'Noun Participant Status',
		rules: [{
			value: '$status',
			pattern: {
				name: '$anchor',
				category: 'Noun',
				concept: '$concept',
				features: {
					'Participant Status': '$status',
					'Noun List Index': '$noun_index',
				},
			},
		}],
	},
	{
		flag: 'Modifier Degree',
		rules: [{
			value: '$degree',
			pattern: {
				name: '$anchor',
				category: 'Adjective|Adverb',
				concept: '$concept',
				features: {
					'Degree': '$degree',
				},
			},
		}],
	},
	{
		flag: 'Speaker',
		rules: [{
			value: '$speaker',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Speaker': '$speaker',
				},
			},
		}],
	},
	{
		flag: 'Listener',
		rules: [{
			value: '$listener',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Listener': '$listener',
				},
			},
		}],
	},
	{
		flag: 'Speaker Attitude',
		rules: [{
			value: '$attitude',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Speaker`s Attitude': '$attitude',
				},
			},
		}],
	},
	{
		flag: 'Speaker-Listener Age',
		rules: [{
			value: '$relative_age',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Speaker-Listener Age': '$relative_age',
				},
			},
		}],
	},
	{
		flag: 'Rhetorical Question',
		rules: [{
			value: '$question_type',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Rhetorical Question': '$question_type',
				},
			},
		}],
	},
	{
		flag: 'Vocabulary Alternate',
		rules: [{
			value: '$alternate_type',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Vocabulary Alternate': '$alternate_type',
				},
			},
		}],
	},
	{
		flag: 'Emphasized Agent of Imperative',
		rules: [{
			value: '$agent',
			pattern: {
				name: '$clause',
				category: 'Clause',
				features: {
					'Illocutionary Force': 'Imperative with emphasized Agent',
				},
				children: [
					{
						name: '$anchor',
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'Most Agent-like',
						},
						children: [{
							category: 'Noun',
							concept: '$agent',
						}],
					},
					{
						category: 'Verb Phrase',
						children: [{
							category: 'Verb',
							concept: '$verb',
						}],
					},
				],
			},
		}],
	},
	{
		flag: 'Agent of Passive',
		rules: [{
			value: '$agent',
			pattern: {
				name: '$clause',
				category: 'Clause',
				features: {
					'Topic NP': 'Most Patient-like',
				},
				children: [
					{
						name: '$anchor',
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'Most Agent-like',
						},
						children: [{
							category: 'Noun',
							concept: '$agent',
						}],
					},
					{
						category: 'Verb Phrase',
						children: [{
							category: 'Verb',
							concept: '$verb',
						}],
					},
				],
			},
			anchor_extra: match => ({
				is_optional: match.captures['$anchor'].node.features?.['Implicit'] === 'Optional Agent of Passive' ? 'true' : 'false',
			}),
		}],
	},
	{
		flag: 'Opening Quotation Frame',
		rules: [{
			value: '$speaker $verb $listener',
			pattern: {
				category: 'Clause',
				children: [
					{
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'Most Agent-like',
						},
						children: [{
							category: 'Noun',
							concept: '$speaker',
						}],
					},
					{
						category: 'Verb Phrase',
						children: [{
							category: 'Verb',
							concept: '$verb',
						}],
					},
					{
						optional: true,
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'Most Patient-like',
						},
						children: [{
							category: 'Noun',
							concept: '$listener',
						}],
					},
					{
						name: '$anchor',
						category: 'Clause',
						features: {
							'Type': 'Patient (Object Complement)',
						},
						children: [{
							category: 'Particle',
							concept: '-QuoteBegin-A',
						}],
					},
				],
			},
		}],
	},
	{
		flag: 'Closing Quotation Frame',
		rules: [{
			value: '$speaker $verb $listener',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Type': 'Closing Quotation Frame',
				},
				children: [
					{
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'Most Agent-like',
						},
						children: [{
							category: 'Noun',
							concept: '$speaker',
						}],
					},
					{
						category: 'Verb Phrase',
						children: [{
							category: 'Verb',
							concept: '$verb',
						}],
					},
					{
						optional: true,
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'Most Patient-like',
						},
						children: [{
							category: 'Noun',
							concept: '$listener',
						}],
					},
				],
			},
		}],
	},
]