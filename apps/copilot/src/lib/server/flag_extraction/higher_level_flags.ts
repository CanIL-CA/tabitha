import type { FlagExtractionRule } from '#lib/types.js'

export const higher_level_flags: FlagExtractionRule[] = [
	{
		flag: 'Intent/Result',
		rules: [{
			value: 'Intent',
			pattern: {
				category: 'Clause',
				children: [
					{
						category: 'Verb Phrase',
						children: [
							{
								category: 'Verb',
								concept: '$event',
							},
						],
					},
					{
						category: 'Clause',
						children: [
							{
								name: '$anchor',
								category: 'Adposition',
								concept: 'so-A|so-C|in-order-to-A',
							},
							{
								category: 'Verb Phrase',
								children: [
									{
										category: 'Verb',
										concept: '$result',
									},
								],
							},
						],
					},
				],
			},
		},
		{
			value: 'Logical Consequence',
			pattern: {
				category: 'Clause',
				children: [
					{
						name: '$anchor',
						category: 'Conjunction',
						concept: 'therefore-A|then-B',
					},
					{
						category: 'Verb Phrase',
						children: [
							{
								category: 'Verb',
								concept: '$result',
							},
						],
					},
				],
			},
		},
		{
			value: 'Simple Result',
			pattern: {
				category: 'Clause',
				children: [
					{
						name: '$anchor',
						category: 'Conjunction',
						concept: 'so-A|then-D',
					},
					{
						category: 'Verb Phrase',
						children: [
							{
								category: 'Verb',
								concept: '$result',
							},
						],
					},
				],
			},
		},
		{
			value: 'Simple Result',
			pattern: {
				category: 'Clause',
				children: [
					{
						category: 'Verb Phrase',
						children: [
							{
								category: 'Verb',
								concept: '$event',
							},
						],
					},
					{
						category: 'Clause',
						children: [
							{
								name: '$anchor',
								category: 'Adposition',
								concept: 'so-B',
							},
							{
								category: 'Verb Phrase',
								children: [
									{
										category: 'Verb',
										concept: '$result',
									},
								],
							},
						],
					},
				],
			},
		}],
	},
	{
		flag: 'Metaphor',
		rules: [{
			value: '$subject as $state',
			pattern: {
				name: '$anchor',
				category: 'Clause',
				features: {
					'Type': 'Independent',
				},
				children: [
					{
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'Most Agent-like',
						},
						children: [{
							category: 'Noun',
							concept: '$subject',
						}],
					},
					{
						category: 'Verb Phrase',
						children: [{
							category: 'Verb',
							concept: 'be-X|be-U',
						}],
					},
					{
						category: 'Noun Phrase',
						features: {
							'Semantic Role': 'State',
						},
						children: [{
							category: 'Noun',
							concept: '$state',
						}],
					},
				],
			},
		}],
	},
	{
		flag: 'Means/Reason',
		rules: [
			{
				value: match => match.captures['$anchor'].node.concept === 'because-B' ? 'Reason' : 'Means',
				pattern: {
					category: 'Clause',
					children: [
						{
							category: 'Verb Phrase',
							children: [{
								category: 'Verb',
								concept: '$event',
							}],
						},
						{
							category: 'Noun Phrase',
							children: [
								{
									name: '$anchor',
									category: 'Adposition',
									concept: 'through-B|because-B',
								},
								{
									category: 'Noun',
									concept: '$means_or_reason',
								},
							],
						},
					],
				},
			},
			{
				value: match => match.captures['$anchor'].node.concept === 'because-A' ? 'Reason' : 'Means',
				pattern: {
					category: 'Clause',
					children: [
						{
							category: 'Verb Phrase',
							children: [
								{
									category: 'Verb',
									concept: '$event',
								},
							],
						},
						{
							category: 'Clause',
							children: [
								{
									name: '$anchor',
									category: 'Adposition',
									concept: 'because-A|by-A',
								},
								{
									category: 'Verb Phrase',
									children: [
										{
											category: 'Verb',
											concept: '$means_or_reason',
										},
									],
								},
							],
						},
					],
				},
			},
		],
	},
	// TODO Directive
]