import { Glob } from 'bun'

const STATUS_PREFIXES = ['OT_verse_status', 'NT_verse_status']

/**
 * The verse status CSVs are exported by hand from a Looker Studio report, so a run can easily go out
 * with older ones (the migration falls back to the newest on disk). Returns the dated CSVs a run
 * on `date` would use that are older than `date`, or nothing when they're all current.
 */
export function stale_status_csvs({ csv_dir, date }: { csv_dir: string, date: string }): { prefix: string, latest_date: string | undefined }[] {
	return STATUS_PREFIXES
		.map(prefix => ({ prefix, latest_date: latest_csv_date({ csv_dir, prefix, date }) }))
		.filter(({ latest_date }) => latest_date !== date)
}

function latest_csv_date({ csv_dir, prefix, date }: { csv_dir: string, prefix: string, date: string }): string | undefined {
	const dates = Array.from(new Glob(`${prefix}_????-??-??.csv`).scanSync(csv_dir))
		.map(file => file.slice(prefix.length + 1, -'.csv'.length))
		.filter(file_date => file_date <= date)
		.sort()
	return dates.at(-1)
}

export function stale_status_message({ stale, date }: { stale: ReturnType<typeof stale_status_csvs>, date: string }): string {
	const used = stale.map(({ prefix, latest_date }) => `${prefix} ${latest_date ?? '(none)'}`).join(', ')
	return `Verse status isn't current for ${date}: using ${used}. Export new CSVs (see data/status/README.md), then run "bun run migrate:status <database_name> data/status ${date}" and re-upload the database and its snapshot to R2 (bunx wrangler r2 object put db-migration-data/<key> --file <key> --remote).`
}
