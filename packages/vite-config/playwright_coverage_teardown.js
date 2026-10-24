// @ts-check
import { e2e_coverage_report } from './playwright.js'

/** Turns the coverage each test added into `coverage/e2e/raw`, the input scripts/ci/merge_coverage.ts reads. */
export default async function generate_e2e_coverage() {
	await (await e2e_coverage_report()).generate()
}
