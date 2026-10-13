import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { plan_migration } from './plan'

let original_cwd: string
let temp_dir: string

beforeEach(() => {
	original_cwd = process.cwd()
	temp_dir = mkdtempSync(join(tmpdir(), 'tabitha-plan-test-'))
	mkdirSync(join(temp_dir, 'raw'))
	process.chdir(temp_dir)
})

afterEach(() => {
	process.chdir(original_cwd)
	rmSync(temp_dir, { recursive: true, force: true })
})

function touch(name: string) {
	writeFileSync(join(temp_dir, 'raw', name), 'fixture content')
}

function stage_ontology(date: string) {
	touch(`Ontology_9494_${date}.tabitha.sqlite`)
}

describe('plan_migration', () => {
	it('does a full build for every task on a first run (no prior outputs)', async () => {
		const date = '2026-08-29'
		touch(`Bible_${date}.tbta.sqlite`)
		touch(`English_${date}.tbta.sqlite`)
		touch(`Sources_Complex_${date}.tabitha.sqlite`)
		stage_ontology(date)

		const plan = await plan_migration(date)

		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(sources.changed).toBe(true)
		expect(sources.previous_output_file).toBeUndefined()
		expect(sources.migrate_args).toEqual([`raw/Bible_${date}.tbta.sqlite`])
		expect(sources.output_file).toBe(`raw/Sources_${date}.tabitha.sqlite`)

		// Only English has a raw file staged -- its task does a full build; the other target-language
		// projects have nothing to build from yet and are skipped individually, not treated as errors.
		const targets_english = plan.tasks.find(t => t.id === 'Targets_English')!
		expect(targets_english.changed).toBe(true)
		expect(targets_english.migrate_args).toEqual([`raw/English_${date}.tbta.sqlite`])

		for (const project of ['Swahili', 'Indonesian', 'Tagalog'] as const) {
			const task = plan.tasks.find(t => t.id === `Targets_${project}`)!
			expect(task.changed).toBe(false)
			expect(task.reason).toBe('no raw input has ever been staged for this task')
		}

		const ontology = plan.tasks.find(t => t.id === 'Ontology')!
		expect(ontology.changed).toBe(true)
		expect(ontology.migrate_args).toEqual([sources.output_file, `raw/Sources_Complex_${date}.tabitha.sqlite`])
	})

	it('skips a task entirely when none of its inputs changed', async () => {
		const prior_date = '2026-08-01'
		touch(`Bible_${prior_date}.tbta.sqlite`)
		touch(`Sources_${prior_date}.tabitha.sqlite`)

		const date = '2026-08-29'
		touch(`English_${date}.tbta.sqlite`) // Targets still needs to build; Sources has nothing new
		touch(`Sources_Complex_${date}.tabitha.sqlite`)
		stage_ontology(date)

		const plan = await plan_migration(date)

		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(sources.changed).toBe(false)
		expect(sources.reason).toContain('no inputs changed')
		expect(sources.output_file).toBe(`raw/Sources_${prior_date}.tabitha.sqlite`)
		expect(sources.migrate_args).toEqual([])
	})

	it('copies forward and reprocesses only the changed inputs when some (not all) changed', async () => {
		const prior_date = '2026-08-01'
		touch(`Bible_${prior_date}.tbta.sqlite`)
		touch(`CommunityDevelopmentTexts_${prior_date}.tbta.sqlite`)
		touch(`Sources_${prior_date}.tabitha.sqlite`)

		const date = '2026-08-29'
		touch(`Bible_${date}.tbta.sqlite`) // only Bible changed this run
		touch(`English_${date}.tbta.sqlite`)
		touch(`Sources_Complex_${date}.tabitha.sqlite`)
		stage_ontology(date)

		const plan = await plan_migration(date)

		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(sources.changed).toBe(true)
		expect(sources.previous_output_file).toBe(`raw/Sources_${prior_date}.tabitha.sqlite`)
		expect(sources.output_file).toBe(`raw/Sources_${date}.tabitha.sqlite`)
		// Only the changed input is passed -- CommunityDevelopmentTexts is left for copy-forward to preserve.
		expect(sources.migrate_args).toEqual([`raw/Bible_${date}.tbta.sqlite`])
	})

	it('treats MissionsDocuments as an optional Sources input, same as the other secondary sources', async () => {
		const prior_date = '2026-08-01'
		touch(`Bible_${prior_date}.tbta.sqlite`)
		touch(`MissionsDocuments_${prior_date}.tbta.sqlite`)
		touch(`Sources_${prior_date}.tabitha.sqlite`)

		const date = '2026-08-29'
		touch(`Bible_${date}.tbta.sqlite`) // only Bible changed this run
		touch(`English_${date}.tbta.sqlite`)
		touch(`Sources_Complex_${date}.tabitha.sqlite`)
		stage_ontology(date)

		const plan = await plan_migration(date)

		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(sources.changed).toBe(true)
		// Only the changed input is passed -- MissionsDocuments is left for copy-forward to preserve.
		expect(sources.migrate_args).toEqual([`raw/Bible_${date}.tbta.sqlite`])
	})

	it('skips a target-language project individually when it has no raw input yet, without failing the run', async () => {
		const date = '2026-08-29'
		touch(`Bible_${date}.tbta.sqlite`)
		touch(`Sources_Complex_${date}.tabitha.sqlite`)
		stage_ontology(date)
		// No English (or any other target-language) raw file staged at all -- unlike the old shared
		// Targets database, this must not fail Sources/Ontology or the other projects' migrations.

		const plan = await plan_migration(date)

		for (const project of ['English', 'Swahili', 'Indonesian', 'Tagalog'] as const) {
			const task = plan.tasks.find(t => t.id === `Targets_${project}`)!
			expect(task.changed).toBe(false)
			expect(task.reason).toBe('no raw input has ever been staged for this task')
		}

		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(sources.changed).toBe(true)
	})

	it('resolves Sources_Complex independently of Sources, even at a different date', async () => {
		const date = '2026-08-29'
		touch(`Bible_${date}.tbta.sqlite`)
		touch(`English_${date}.tbta.sqlite`)
		stage_ontology(date)
		// Sources_Complex wasn't regenerated this run (English/Bible/Sample all unchanged at staging) --
		// only an older one exists.
		touch('Sources_Complex_2026-08-01.tabitha.sqlite')

		const plan = await plan_migration(date)

		const ontology = plan.tasks.find(t => t.id === 'Ontology')!
		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(ontology.migrate_args).toEqual([sources.output_file, 'raw/Sources_Complex_2026-08-01.tabitha.sqlite'])
	})

	it('never mistakes Sources_Complex for a prior Sources output, even though it sorts after it', async () => {
		const date = '2026-09-29'
		touch('Bible_2026-07-27.tbta.sqlite')
		touch('Sources_2026-07-27.tabitha.sqlite')
		touch('Sources_Complex_2026-06-25.tabitha.sqlite')
		stage_ontology(date)

		const plan = await plan_migration(date)

		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(sources.changed).toBe(false)
		expect(sources.output_file).toBe('raw/Sources_2026-07-27.tabitha.sqlite')

		const ontology = plan.tasks.find(t => t.id === 'Ontology')!
		expect(ontology.migrate_args).toEqual(['raw/Sources_2026-07-27.tabitha.sqlite', 'raw/Sources_Complex_2026-06-25.tabitha.sqlite'])
	})

	it('throws when Sources changed but no Ontology database was staged for the run date', async () => {
		const date = '2026-08-29'
		touch(`Bible_${date}.tbta.sqlite`)
		touch(`English_${date}.tbta.sqlite`)
		touch(`Sources_Complex_${date}.tabitha.sqlite`)

		await expect(plan_migration(date)).rejects.toThrow(/No staged Ontology database/)
	})

	it('skips the Ontology when none was delivered and Sources is unchanged, so a target-language-only delivery can run', async () => {
		const prior_date = '2026-07-31'
		touch(`Bible_${prior_date}.tbta.sqlite`)
		touch(`Sources_${prior_date}.tabitha.sqlite`)
		touch(`Sources_Complex_${prior_date}.tabitha.sqlite`)
		touch(`Indonesian_${prior_date}.tbta.sqlite`)
		touch(`Targets_Indonesian_${prior_date}.tabitha.sqlite`)
		stage_ontology('2026-09-29')

		const date = '2026-10-06'
		touch(`Indonesian_${date}.tbta.sqlite`)

		const plan = await plan_migration(date)

		const ontology = plan.tasks.find(t => t.id === 'Ontology')!
		expect(ontology.changed).toBe(false)
		expect(ontology.output_file).toBe('raw/Ontology_9494_2026-09-29.tabitha.sqlite')

		const sources = plan.tasks.find(t => t.id === 'Sources')!
		expect(sources.changed).toBe(false)

		const indonesian = plan.tasks.find(t => t.id === 'Targets_Indonesian')!
		expect(indonesian.changed).toBe(true)
		expect(indonesian.previous_output_file).toBe(`raw/Targets_Indonesian_${prior_date}.tabitha.sqlite`)
		expect(indonesian.migrate_args).toEqual([`raw/Indonesian_${date}.tbta.sqlite`])
	})
})
