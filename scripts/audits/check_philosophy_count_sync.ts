import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

// AGENTS.md is the canonical source of truth for how many development
// philosophies exist (see its own "Canonical Single Source of Truth" note).
// README.md and CONTRIBUTING.md each restate that count in prose, and those
// restatements have no structural link back to AGENTS.md -- they only stay
// correct if whoever adds a philosophy remembers to update every mention.
// This audit catches the drift mechanically instead of relying on memory.

export type PhilosophyCountFinding = {
	readonly location: string
	readonly expected: number
	readonly current: number | 'missing'
	readonly message: string
}

export type PhilosophyCountAuditResult = {
	readonly is_synced: boolean
	readonly findings: readonly PhilosophyCountFinding[]
}

export const get_canonical_philosophy_count = async (base_dir: string = root_dir): Promise<number> => {
	const agents_path = join(base_dir, 'AGENTS.md')
	const content = await readFile(agents_path, 'utf-8')
	const headings = [...content.matchAll(/^### (\d+)\./gm)].map(match => Number(match[1]))

	if (headings.length === 0) {
		throw new Error('No numbered philosophy headings (### N. ...) found in AGENTS.md')
	}

	const highest = Math.max(...headings)
	if (headings.length !== highest) {
		throw new Error(
			`AGENTS.md has ${headings.length} numbered philosophy headings but the highest number is ${highest} -- numbering has a gap or duplicate`,
		)
	}

	return highest
}

export const audit_and_sync_readme_philosophy_count = ({
	content,
	expected_count,
}: {
	readonly content: string
	readonly expected_count: number
}): { findings: PhilosophyCountFinding[]; updated_content: string } => {
	const findings: PhilosophyCountFinding[] = []
	let updated_content = content

	const badge_regex = /Code_Style-(\d+)_Philosophies-blueviolet\?style=flat-square" alt="(\d+) Philosophies"/
	const badge_match = updated_content.match(badge_regex)
	if (badge_match) {
		const current = Number(badge_match[1])
		if (current !== expected_count) {
			findings.push({
				location: 'README.md badge',
				expected: expected_count,
				current,
				message: `README badge says ${current} Philosophies but AGENTS.md defines ${expected_count}`,
			})
			updated_content = updated_content.replace(
				badge_regex,
				`Code_Style-${expected_count}_Philosophies-blueviolet?style=flat-square" alt="${expected_count} Philosophies"`,
			)
		}
	} else {
		findings.push({
			location: 'README.md badge',
			expected: expected_count,
			current: 'missing',
			message: 'README Code_Style philosophies badge is missing or does not match the expected format',
		})
	}

	const row_numbers = [...updated_content.matchAll(/\| \*\*(\d+)\*\* \|/g)].map(match => Number(match[1]))
	const highest_row = row_numbers.length > 0 ? Math.max(...row_numbers) : 0
	if (highest_row !== expected_count) {
		findings.push({
			location: 'README.md philosophy table',
			expected: expected_count,
			current: highest_row,
			message: `README's Development Philosophies table's highest numbered row is ${highest_row} but AGENTS.md defines ${expected_count} -- add the missing row(s) by hand, since their wording can't be generated`,
		})
	}

	return { findings, updated_content }
}

export const audit_and_sync_contributing_philosophy_count = ({
	content,
	expected_count,
}: {
	readonly content: string
	readonly expected_count: number
}): { findings: PhilosophyCountFinding[]; updated_content: string } => {
	const findings: PhilosophyCountFinding[] = []
	let updated_content = content

	const intro_regex = /\*\*(\d+) TaBiThA Development Philosophies\*\*/
	const intro_match = updated_content.match(intro_regex)
	if (intro_match) {
		const current = Number(intro_match[1])
		if (current !== expected_count) {
			findings.push({
				location: 'CONTRIBUTING.md intro sentence',
				expected: expected_count,
				current,
				message: `CONTRIBUTING.md says ${current} TaBiThA Development Philosophies but AGENTS.md defines ${expected_count}`,
			})
			updated_content = updated_content.replace(intro_regex, `**${expected_count} TaBiThA Development Philosophies**`)
		}
	} else {
		findings.push({
			location: 'CONTRIBUTING.md intro sentence',
			expected: expected_count,
			current: 'missing',
			message: 'CONTRIBUTING.md philosophy-count intro sentence not found in the expected format',
		})
	}

	const summary_regex = /\*\*The (\d+) Philosophies\*\*/
	const summary_match = updated_content.match(summary_regex)
	if (summary_match) {
		const current = Number(summary_match[1])
		if (current !== expected_count) {
			findings.push({
				location: 'CONTRIBUTING.md summary bullet',
				expected: expected_count,
				current,
				message: `CONTRIBUTING.md summary bullet says "The ${current} Philosophies" but AGENTS.md defines ${expected_count}`,
			})
			updated_content = updated_content.replace(summary_regex, `**The ${expected_count} Philosophies**`)
		}
	} else {
		findings.push({
			location: 'CONTRIBUTING.md summary bullet',
			expected: expected_count,
			current: 'missing',
			message: 'CONTRIBUTING.md "The N Philosophies" summary bullet not found in the expected format',
		})
	}

	return { findings, updated_content }
}

export const sync_philosophy_count = async ({
	base_dir = root_dir,
	should_write = false,
}: {
	readonly base_dir?: string
	readonly should_write?: boolean
}): Promise<PhilosophyCountAuditResult> => {
	const readme_path = join(base_dir, 'README.md')
	const contributing_path = join(base_dir, 'CONTRIBUTING.md')
	if (!existsSync(readme_path)) throw new Error(`README.md not found at ${readme_path}`)
	if (!existsSync(contributing_path)) throw new Error(`CONTRIBUTING.md not found at ${contributing_path}`)

	const expected_count = await get_canonical_philosophy_count(base_dir)
	const readme_content = await readFile(readme_path, 'utf-8')
	const contributing_content = await readFile(contributing_path, 'utf-8')

	const readme_audit = audit_and_sync_readme_philosophy_count({ content: readme_content, expected_count })
	const contributing_audit = audit_and_sync_contributing_philosophy_count({
		content: contributing_content,
		expected_count,
	})

	if (should_write) {
		if (readme_audit.updated_content !== readme_content) {
			await writeFile(readme_path, readme_audit.updated_content, 'utf-8')
		}
		if (contributing_audit.updated_content !== contributing_content) {
			await writeFile(contributing_path, contributing_audit.updated_content, 'utf-8')
		}
	}

	const findings = [...readme_audit.findings, ...contributing_audit.findings]
	return { is_synced: findings.length === 0, findings }
}

async function run_cli() {
	const args = process.argv.slice(2)
	const should_fix = args.includes('--fix') || args.includes('-f') || args.includes('--sync')

	console.log(`
============================================================
   🔢 TaBiThA Philosophy Count Consistency Linter
============================================================
`)

	if (should_fix) {
		await sync_philosophy_count({ base_dir: root_dir, should_write: true })
	}

	const result = await sync_philosophy_count({ base_dir: root_dir, should_write: false })

	if (result.is_synced) {
		console.log('✅ Philosophy count is consistent across AGENTS.md, README.md, and CONTRIBUTING.md.\n')
		return
	}

	console.error(`❌ Detected ${result.findings.length} philosophy-count mismatch(es):\n`)
	for (const finding of result.findings) {
		console.error(`   • [${finding.location}] ${finding.message}`)
	}
	if (!should_fix) {
		console.error(
			"\n💡 Run with --fix to auto-sync the mentions that are a plain string swap (badge, intro sentence, summary bullet). A flagged table row still needs a manual edit, since its wording can't be generated.\n",
		)
	} else {
		console.error("\n💡 The mismatch(es) above couldn't be auto-fixed and need a manual edit.\n")
	}
	process.exit(1)
}

if (import.meta.main) {
	await run_cli()
}
