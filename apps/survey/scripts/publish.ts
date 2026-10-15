// Publishes a survey definition file and prints its review and results links:
//   bun run publish <file.json>            to production, with your own wrangler login
//   bun run publish <file.json> --local    to the local database, for `bun run dev`
// Publishing goes straight to D1 rather than through an app endpoint, so the app has no write
// route for surveys and no publish secret (docs/decisions/0024-survey-app.md).

import { execFileSync } from 'node:child_process'
import { randomBytes, randomInt } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SurveyDefinition } from '@tabitha/types/survey'
import { PORTS } from '@tabitha/vite-config/ports'
import { definition_problems, publish_sql } from '#lib/publish.js'

// D1 refuses a single SQL statement over 100 KB.
const MAX_STATEMENT_BYTES = 100_000

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))

const [file] = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const local = process.argv.includes('--local')
if (!file) {
	console.error('Usage: bun run publish <file.json> [--local]')
	process.exit(1)
}

const definition = JSON.parse(readFileSync(file, 'utf8')) as SurveyDefinition
const problems = definition_problems(definition)
if (problems.length) {
	console.error(`Not published:\n${problems.map(problem => `  - ${problem}`).join('\n')}`)
	process.exit(1)
}

const survey_id = randomBytes(12).toString('base64url')
const results_key = randomBytes(24).toString('base64url')
const sql = publish_sql({
	definition,
	survey_id,
	results_key,
	swaps: definition.items.map(() => randomInt(2) === 1),
	created_at: new Date().toISOString(),
})

const oversized = sql.split('\n').filter(statement => Buffer.byteLength(statement) > MAX_STATEMENT_BYTES)
if (oversized.length) {
	console.error(`Not published: ${oversized.length} item(s) are over D1's 100 KB statement limit. Trim their outputs.`)
	process.exit(1)
}

const sql_dir = mkdtempSync(join(tmpdir(), 'survey-publish-'))
try {
	const sql_path = join(sql_dir, 'publish.sql')
	writeFileSync(sql_path, sql)
	execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB_Survey', local ? '--local' : '--remote', '--file', sql_path], { cwd: APP_DIR, stdio: 'inherit' })
} finally {
	rmSync(sql_dir, { recursive: true, force: true })
}

const origin = local ? `http://localhost:${PORTS.survey.port}` : 'https://survey.tabitha.bible'
console.info(`
Published "${definition.title}" (${definition.items.length} items)
  Send to reviewers:  ${origin}/r/${survey_id}
  Results (keep it):  ${origin}/r/${survey_id}/results?key=${results_key}
`)
