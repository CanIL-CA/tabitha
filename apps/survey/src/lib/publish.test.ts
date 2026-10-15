import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { SurveyDefinition, SurveyItem } from '@tabitha/types/survey'
import { describe, expect, it } from 'vitest'
import { definition_problems, publish_sql } from './publish'

const MIGRATION = readFileSync(new URL('../../migrations/0001_surveys.sql', import.meta.url), 'utf8')

function item(key: string): SurveyItem {
	return {
		key,
		title: `Title ${key}`,
		chips: ['English'],
		context: [{ label: 'English', text: 'In the beginning God created the heavens and the earth.' }],
		outputs: [
			{ sections: [{ title: 'Notes', entries: [[{ text: `first output of ${key}` }]], empty: 'None.' }] },
			{ sections: [{ title: 'Notes', entries: [[{ text: `second output of ${key}` }]], empty: 'None.' }] },
		],
		results_notes: [`note about ${key}`],
	}
}

function definition(overrides: Partial<SurveyDefinition> = {}): SurveyDefinition {
	return {
		title: "Copilot's brief review",
		description: 'Two outputs per verse.',
		instructions: ['Pick the better one.'],
		output_names: ['baseline', 'variant'],
		rubric: {
			question: 'Which is better?',
			scale: [{ label: 'A', short: 'A' }, { label: 'Same', short: '=' }, { label: 'B', short: 'B' }],
			issues: [{ key: 'meaning', label: 'Wrong meaning' }],
			comment_placeholder: 'Anything else?',
		},
		results_stats: [{ label: 'Tokens', value: '10 → 5' }],
		items: [item('genesis-1-1'), item('john-3-16')],
		...overrides,
	}
}

/** Runs the SQL against a fresh database built from the real migration, and returns what landed. */
function publish_to_database({ swaps }: { swaps: boolean[] }) {
	const db = new DatabaseSync(':memory:')
	db.exec(MIGRATION)
	db.exec(publish_sql({ definition: definition(), survey_id: 'survey-1', results_key: 'key-1', swaps, created_at: '2026-10-15T00:00:00.000Z' }))
	return {
		survey: db.prepare('SELECT * FROM Surveys').get() as Record<string, string>,
		items: db.prepare('SELECT * FROM Items ORDER BY position').all() as Record<string, string | number>[],
	}
}

describe('publish_sql', () => {
	it('keeps output names and publisher figures out of what reviewers are sent', () => {
		const { survey } = publish_to_database({ swaps: [false, false] })

		expect(JSON.parse(survey.review_definition)).toEqual({
			title: "Copilot's brief review",
			description: 'Two outputs per verse.',
			instructions: ['Pick the better one.'],
			rubric: definition().rubric,
		})
		expect(JSON.parse(survey.results_definition)).toEqual({ output_names: ['baseline', 'variant'], results_stats: [{ label: 'Tokens', value: '10 → 5' }] })
		expect(survey.results_key).toBe('key-1')
	})

	it('shows the second output as A only on swapped items, and records which ones were swapped', () => {
		const { items } = publish_to_database({ swaps: [true, false] })

		const contents = items.map(row => JSON.parse(String(row.content)))
		expect(contents.map(content => content.outputs.a.sections[0].entries[0][0].text)).toEqual(['second output of genesis-1-1', 'first output of john-3-16'])
		expect(items.map(row => row.swapped)).toEqual([1, 0])
	})

	it('keeps results-only notes out of the item content reviewers see', () => {
		const { items } = publish_to_database({ swaps: [false, false] })

		expect(JSON.parse(String(items[0].content))).not.toHaveProperty('results_notes')
		expect(JSON.parse(String(items[0].results_notes))).toEqual(['note about genesis-1-1'])
	})

	it('stores text containing quotes unchanged', () => {
		const { survey } = publish_to_database({ swaps: [false, false] })

		expect(JSON.parse(survey.review_definition).title).toBe("Copilot's brief review")
	})
})

describe('definition_problems', () => {
	it('accepts a valid definition', () => {
		expect(definition_problems(definition())).toEqual([])
	})

	it.each([
		['an even-length scale', { rubric: { ...definition().rubric, scale: [{ label: 'A', short: 'A' }, { label: 'B', short: 'B' }] } }, /odd number of choices/],
		['no items', { items: [] }, /items is empty/],
		['a repeated item key', { items: [item('john-3-16'), item('john-3-16')] }, /"john-3-16" is used more than once/],
		['an item with one output', { items: [{ ...item('john-3-16'), outputs: [item('x').outputs[0]] as unknown as SurveyItem['outputs'] }] }, /needs exactly two outputs/],
		['repeated issue keys', { rubric: { ...definition().rubric, issues: [{ key: 'meaning', label: 'A' }, { key: 'meaning', label: 'B' }] } }, /duplicate keys/],
	])('reports %s', (_name, overrides, expected) => {
		expect(definition_problems(definition(overrides as Partial<SurveyDefinition>))).toEqual([expect.stringMatching(expected)])
	})
})
