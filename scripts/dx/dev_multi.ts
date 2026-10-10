import { createInterface } from 'node:readline/promises'
import { execFileSync } from 'node:child_process'
import { platform } from 'node:os'
import { check_env_files } from './doctor'

type AppInfo = {
	id: string
	index: number
	pkg: string
	name: string
	port: number
	desc: string
	color: string	// ANSI color code for terminal output
}

export const APPS: Record<string, AppInfo> = {
	ontology: {
		id: 'ontology',
		index: 1,
		pkg: '@tabitha/ontology',
		name: 'Ontology',
		port: 3056,
		desc: 'Concepts, Senses, and Examples (D1)',
		color: '\x1b[32m', // green
	},
	targets: {
		id: 'targets',
		index: 2,
		pkg: '@tabitha/targets',
		name: 'Targets',
		port: 1382,
		desc: 'Target Language Text and Lexicon (D1)',
		color: '\x1b[33m', // yellow
	},
	sources: {
		id: 'sources',
		index: 3,
		pkg: '@tabitha/sources',
		name: 'Sources',
		port: 1947,
		desc: 'Biblical Source Text Encoding (D1)',
		color: '\x1b[34m', // blue
	},
	editor: {
		id: 'editor',
		index: 4,
		pkg: '@tabitha/editor',
		name: 'Editor',
		port: 1337,
		desc: 'Phase 1 Workbench & Checker',
		color: '\x1b[35m', // magenta
	},
	copilot: {
		id: 'copilot',
		index: 5,
		pkg: '@tabitha/copilot',
		name: 'Copilot',
		port: 9000,
		desc: 'AI Translation Guidance (Vertex / Gemini)',
		color: '\x1b[36m', // cyan
	},
	www: {
		id: 'www',
		index: 6,
		pkg: '@tabitha/www',
		name: 'Www',
		port: 1455,
		desc: 'Public Website & Marketing Site (Static)',
		color: '\x1b[31m', // red
	},
}

const COLOR_RESET = '\x1b[0m'

export async function run_dev_applications(app_keys: string[]) {
	const is_win = platform() === 'win32'
	const apps_to_run = app_keys.map(k => APPS[k]).filter(Boolean)
	
	if (apps_to_run.length === 0) {
		console.log('⚠️  No valid apps selected.')
		process.exit(0)
	}

	// Warn, don't block: a stale .env.local only breaks the features that read the stale value
	const env_problems = (await check_env_files(apps_to_run.map(app => app.id))).filter(result => result.status !== 'PASS')
	for (const problem of env_problems) {
		console.warn(`⚠️  ${problem.name}: ${problem.message}${problem.fix ? `\n   👉 ${problem.fix}` : ''}`)
	}

	console.log(`
============================================================
🚀 Launching ${apps_to_run.length} Development Server(s)...
============================================================

Active Endpoints:`)
	for (const app of apps_to_run) {
		console.log(`  • ${app.name.padEnd(10)} http://localhost:${app.port} (${app.desc})`)
	}
	console.log('============================================================\n')
	console.log('Press q+Enter to exit\n')

	const app_processes = new Map<string, ReturnType<typeof Bun.spawn>>()
	let terminating = false

	for (const app of apps_to_run) {
		// Pipe stdout and stderr with color-coded prefixes
		const prefix = `${app.color}[${app.pkg}]${COLOR_RESET} `

		const cmd = ['bun', '--filter', app.pkg, 'dev']
		const child = Bun.spawn(cmd, {
			env: process.env,
			stdout: 'pipe',
			stderr: 'pipe',
			// Non-Windows: become its own process-group leader so terminate_apps()
			// can kill the whole tree (bun --filter's own `vite dev` child included)
			// via the group instead of just this one process.
			detached: !is_win,
			async onExit(_proc, exit_code, _sig, error) {
				if (error) {
					console.error(`${prefix} Unexpected error:`, error.message)
				}
				// If an app crashes unexpectedly, kill the rest to avoid orphaned services
				if (!terminating && exit_code !== 0 && exit_code !== null) {
					app_processes.delete(app.id)
					console.error(`${prefix} crashed with exit code ${exit_code}. Shutting down all apps...`)
					await terminate_apps()
				}
			},
		})

		function create_subprocess_pipe({ input_stream, stdio_output }: {
			input_stream: typeof child.stdout
			stdio_output: Bun.BunFile
		}) {
			input_stream.pipeThrough(new TextDecoderStream())
				.pipeThrough(new TransformStream<string, string>({
					transform(chunk, controller) {
						for (const line of chunk.trimEnd().split('\n')) {
							controller.enqueue(`${prefix}${line}\n`)
						}
					},
				}))
				.pipeTo(new WritableStream({
					async write(chunk) {
						await stdio_output.write(chunk)
					},
				}))
				// Killing an app tears its stdio out from under this pipe, which rejects. That's the
				// expected path on shutdown, not a fault worth reporting, but left unhandled it
				// surfaces as an unhandled rejection on the way out.
				.catch(() => {})
		}

		create_subprocess_pipe({ input_stream: child.stdout, stdio_output: Bun.stdout })
		create_subprocess_pipe({ input_stream: child.stderr, stdio_output: Bun.stderr })

		app_processes.set(app.id, child)
	}

	// Declared before terminate_apps rather than after: terminate_apps closes it, and can be
	// reached from a child's onExit callback, so relying on that landing a tick later than this
	// assignment would be an ordering dependency waiting to break.
	const rl = createInterface({ input: process.stdin, output: process.stdout })

	async function terminate_apps() {
		console.log(`Terminating ${app_processes.size} apps...`)
		terminating = true

		for (const app_process of app_processes.values()) {
			// exitCode is null while running and a number (including 0) once exited, so this has to
			// be an explicit null check -- a plain truthiness test reads a clean 0 exit as "still
			// running". Note it only affects the log: the kill below still runs either way, because
			// the `bun --filter` leader exiting doesn't guarantee its `vite dev` child went with it,
			// and that surviving grandchild is exactly what this function exists to catch.
			if (app_process.exitCode !== null) {
				console.log(`process ${app_process.pid} already exited with exit code ${app_process.exitCode}`)
			}
			if (is_win) {
				// taskkill /t walks the actual process tree, killing `bun --filter`
				// and the `vite dev` child it spawned together.
				try {
					execFileSync('taskkill', ['/pid', String(app_process.pid), '/t', '/f'])
				} catch {
					// Child may have already exited between the check above and taskkill running.
				}
			} else {
				// Negative PID targets the whole process group (see the `detached` spawn option above).
				try {
					process.kill(-app_process.pid, 'SIGTERM')
				} catch {
					// Child may have already exited (and its pid been reused) between the check above and this call.
				}
			}
		}
		await Promise.all([...app_processes.values()].map(proc => proc.exited))
		console.log(`${app_processes.size} apps shutdown`)
		rl.close()
		process.exit(0)
	}

	rl.on('line', line => {
		if (line === 'q') {
			terminate_apps()
		}
	})
	// Without this, readline (attached to a TTY) absorbs the first Ctrl+C into its own
	// 'pause' event instead of letting it reach process's 'SIGINT' -- only the second
	// Ctrl+C would actually trigger terminate_apps(), which now matters more than before
	// since the detached children no longer get a free group-wide SIGINT from the terminal.
	rl.on('SIGINT', () => terminate_apps())

	process.on('SIGINT', terminate_apps)
}

if (import.meta.main) {
	await run_dev_applications(Object.keys(APPS))
}