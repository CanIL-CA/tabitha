export const json_response_schema = {
	type: 'object',
	properties: {
		section4: {
			type: 'object',
			description: 'SIL Translator Notes',
			properties: {
				sourcePointabilityRows: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							note: {
								type: 'string',
							},
							tnnSource: {
								type: 'string',
								description: 'Verbatim or close paraphrase of the TNN span.',
							},
							function: {
								type: 'string',
								enum: [
									'MECHANICS',
									'CULTURAL',
									'BACKGROUND',
								],
							},
							verseTerm: {
								type: ['string', 'null'],
							},
							lwcSpan: {
								type: ['string', 'null'],
							},
							verdict: {
								type: 'object',
								properties: {
									type: {
										type: 'string',
										enum: [
											'RETAIN',
											'SECTION 5',
											'CUT',
											'NOT APPLICABLE',
											'SOLVED',
										],
									},
									subtype: {
										type: ['string', 'null'],
										enum: [
											null,
											'CULTURAL',
											'BACKGROUND',
											'OUT OF SCOPE',
											'NULL PAYLOAD',
										],
									},
									pointer: {
										type: ['string', 'null'],
									},
									reason: {
										type: ['string', 'null'],
									},
								},
								required: ['type'],
							},
						},
						required: [
							'note',
							'tnnSource',
							'function',
							'lwcSpan',
							'verdict',
						],
					},
				},
				notes: {
					type: 'array',
					description: 'Section 4 notes after filtering.',
					items: {
						type: 'object',
						properties: {
							text: {
								type: 'string',
							},
						},
						required: ['text'],
					},
				},
				excluded: {
					type: 'array',
					description: 'Mechanics notes excluded from Section 4.',
					items: {
						type: 'object',
						properties: {
							note: {
								type: 'string',
							},
							reason: {
								type: 'string',
							},
						},
						required: [
							'note',
							'reason',
						],
					},
				},
			},
			required: [
				'sourcePointabilityRows',
				'notes',
				'excluded',
			],
		},

		section5: {
			type: 'object',
			description: 'Cultural Context Summary',
			properties: {
				cultural: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							term: {
								type: 'string',
							},
							summary: {
								type: 'string',
							},
						},
						required: [
							'term',
							'summary',
						],
					},
				},
				background: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							term: {
								type: 'string',
							},
							summary: {
								type: 'string',
							},
						},
						required: [
							'term',
							'summary',
						],
					},
				},
			},
			required: [
				'cultural',
				'background',
			],
		},

		section6: {
			type: 'object',
			description: 'Image Keywords',
			properties: {
				keywords: {
					type: 'array',
					items: {
						type: 'string',
					},
				},
			},
			required: ['keywords'],
		},

		section7: {
			type: 'object',
			description: 'Consultant Note Candidate',
			properties: {
				decisions: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							status: {
								type: 'string',
								enum: [
									'RESOLVED UPSTREAM',
									'CONFLICT',
									'UNRESOLVED',
								],
							},
							text: {
								type: 'string',
							},
						},
						required: [
							'status',
							'text',
						],
					},
				},
				resolvedUpstream: {
					type: 'array',
					description: 'High-rigor trace lines that are not displayed as decisions.',
					items: {
						type: 'object',
						properties: {
							label: {
								type: 'string',
							},
							reason: {
								type: 'string',
							},
						},
						required: [
							'label',
							'reason',
						],
					},
				},
			},
			required: [
				'decisions',
				'resolvedUpstream',
			],
		},
	},
	required: [
		'section4',
		'section5',
		'section6',
		'section7',
	],
}