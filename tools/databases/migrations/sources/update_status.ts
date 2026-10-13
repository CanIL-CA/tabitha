import { $ } from 'bun'
import { join } from 'path'
import { migrate_source_status } from './migrate_source_status'
import { collecting_sql_runner, render_sql_file } from './sql_runner'
import { create_logger } from '../log'

const log = create_logger('Status update')

const USAGE = 'Usage: bun sources/update_status.ts <d1_database_name> [csv_dir] [YYYY-MM-DD]'

/**
 * Applies the latest available verse status CSVs directly to a live Sources D1 database, decoupled
 * from any migration run -- csv_dir defaults to this repo's data/status/ directory, and date
 * defaults to today (both fall back to the latest available file if an exact match isn't found, the
 * same as everywhere else in the pipeline).
 */
export async function apply_status_to_d1({ d1_database_name, csv_dir, date }: {
	d1_database_name: string
	csv_dir: string
	date: string
}): Promise<void> {
	const runner = collecting_sql_runner()
	await migrate_source_status({ runner, csv_dir, date })

	const sql_file = `raw/.status-update-${d1_database_name}-${date}.sql`
	await Bun.write(sql_file, render_sql_file(runner.statements))

	log.step(`Applying ${runner.statements.length} status statement(s) to live D1 database "${d1_database_name}"...`)
	await $`bun wrangler d1 execute ${d1_database_name} --remote --file ${sql_file}`

	log.summary()
}

if (import.meta.main) {
	const d1_database_name = Bun.argv[2]
	if (!d1_database_name) {
		throw new Error(USAGE)
	}

	const csv_dir = Bun.argv[3] || join(import.meta.dir, '../../data/status')
	const date = Bun.argv[4] || new Date().toISOString().slice(0, 10)

	await apply_status_to_d1({ d1_database_name, csv_dir, date })
}
