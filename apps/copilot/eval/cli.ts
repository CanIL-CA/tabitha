import { startVitest } from 'vitest/node'

const USAGE = `Usage:
  bun run eval capture                       Record each case's inputs (sources, targets, Aquifer)
  bun run eval run <variant> [--force]       Generate every case with a variant (skips cases already run)
  bun run eval report <variant> [baseline]   Compare a variant with the baseline run (default "baseline")
  bun run eval export <variant> [baseline]   Write that comparison as a survey file for apps/survey`

const [command, ...args] = process.argv.slice(2)
const positional = args.filter(arg => !arg.startsWith('--'))

const STEPS: Record<string, { file: string, provide: Record<string, unknown> } | undefined> = {
	capture: { file: 'eval/capture.eval.ts', provide: {} },
	run: { file: 'eval/run.eval.ts', provide: { variant: positional[0], force: args.includes('--force') } },
	report: { file: 'eval/report.eval.ts', provide: { variant: positional[0], baseline: positional[1] ?? 'baseline' } },
	export: { file: 'eval/export.eval.ts', provide: { variant: positional[0], baseline: positional[1] ?? 'baseline' } },
}

const step = command ? STEPS[command] : undefined
if (!step || command !== 'capture' && !positional[0]) {
	console.error(USAGE)
	process.exit(1)
}

const vitest = await startVitest('test', [step.file], {
	config: 'eval/vitest.config.ts',
	run: true,
	watch: false,
	provide: step.provide,
})
await vitest.close()
