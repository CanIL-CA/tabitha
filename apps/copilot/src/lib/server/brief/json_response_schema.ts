export const json_response_schema = {
	type: 'object',
	properties: {
		section4: {
			type: 'object',
			description: 'SIL Translator Notes',
			properties: {
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
			},
			required: [
				'notes',
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
			},
			required: [
				'decisions',
			],
		},
	},
	required: [
		'section4',
		'section5',
		'section7',
	],
}