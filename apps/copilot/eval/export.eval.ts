import { inject, test } from 'vitest'
import { read_json, report_path, survey_path, write_json, type Report } from './data'
import { to_survey } from './survey'

test('export', () => {
	const names = { baseline: inject('baseline'), variant: inject('variant') }
	const report = read_json<Report>(report_path(names))
	if (!report) throw new Error(`No report for ${names.baseline} vs ${names.variant}; run \`bun run eval report ${names.variant}\` first.`)

	const path = survey_path(names)
	write_json({ path, value: to_survey({ report }) })
	process.stderr.write(`\nSurvey file for ${report.cases.length} verses: ${path}\nPublish it from apps/survey: bun run publish ${path}\n\n`)
})
