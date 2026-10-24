import { existsSync } from 'node:fs'
import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { layers_by_workspace, layers_markdown } from './coverage_layers'
import { vitest_workspaces } from './coverage_summary'
import { generate_e2e_coverage, read_unit_coverage } from './monocart_report'
import { read_manifests, root_dir } from './report_coverage'

const layers_dir = join(root_dir, 'coverage', 'layers')
const markdown_path = join(layers_dir, 'report.md')

/**
 * Joins the unit reports from `bun run test:coverage` with the raw e2e coverage from an
 * `E2E_COVERAGE=1` e2e run into the unit / e2e / union / intersection table. CI runs it in its own
 * job, once both jobs' output is downloaded into place.
 */
async function merge_coverage() {
	const workspaces = vitest_workspaces(await read_manifests())
	const unit = await read_unit_coverage({ root_dir, workspaces })
	await rm(layers_dir, { recursive: true, force: true })
	await mkdir(layers_dir, { recursive: true })
	const e2e = await generate_e2e_coverage({ root_dir, workspaces, output_dir: join(layers_dir, 'e2e') })
	if (Object.keys(unit.files).length === 0 || Object.keys(e2e).length === 0) {
		console.error('❌ Needs both layers. Run `bun run test:coverage` and `E2E_COVERAGE=1 bun run test:e2e` first.')
		process.exit(1)
	}

	const markdown = layers_markdown({ layers: layers_by_workspace({ root_dir, unit: unit.files, e2e }) })
	await writeFile(markdown_path, markdown, 'utf-8')
	console.log(`\n${markdown}`)

	const summary_file = process.env.GITHUB_STEP_SUMMARY
	if (summary_file && existsSync(summary_file)) await appendFile(summary_file, markdown, 'utf-8')
}

if (import.meta.main) {
	await merge_coverage()
}
