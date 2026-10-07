import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDITS, type Audit } from './registry'

const root_dir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

export type AuditOutcome = 'success' | 'failure'

export type AuditResult = Audit & {
	readonly outcome: AuditOutcome
}

const icon = ({ outcome, blocking }: AuditResult): string => {
	if (outcome === 'success') return '✅'
	return blocking ? '❌' : '⚠️'
}

export function format_summary(results: readonly AuditResult[]): string {
	const rows = results.map(r => `  ${icon(r)} ${r.script}${r.blocking ? ' (blocking)' : ''}`)
	const failed = results.filter(r => r.outcome === 'failure')
	const footer = failed.length === 0
		? `All ${results.length} audits passed.`
		: `${failed.length} of ${results.length} audits failed.`
	return ['📋 Audit summary', ...rows, '', footer].join('\n')
}

// Only a blocking audit fails the run; advisory failures are reported but never stop it.
export const has_blocking_failure = (results: readonly AuditResult[]): boolean =>
	results.some(r => r.blocking && r.outcome === 'failure')

async function run_audit(audit: Audit, is_ci: boolean): Promise<AuditResult> {
	console.log(is_ci ? `::group::${audit.script}` : `\n▶️  ${audit.script}\n`)
	const proc = Bun.spawn(['bun', 'run', audit.script], { cwd: root_dir, stdio: ['inherit', 'inherit', 'inherit'] })
	const exit_code = await proc.exited
	if (is_ci) console.log('::endgroup::')
	return { ...audit, outcome: exit_code === 0 ? 'success' : 'failure' }
}

if (import.meta.main) {
	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	// Sequential rather than parallel, so each audit's output stays readable as one block.
	const results: AuditResult[] = []
	for (const audit of AUDITS) {
		results.push(await run_audit(audit, is_ci))
	}

	console.log(`\n${format_summary(results)}\n`)

	// CI's pr_summary job builds its advisory table from this output.
	const output_path = process.env.GITHUB_OUTPUT
	if (output_path) {
		await appendFile(output_path, `results=${JSON.stringify(results)}\n`)
	}

	if (has_blocking_failure(results)) {
		process.exit(1)
	}
}
