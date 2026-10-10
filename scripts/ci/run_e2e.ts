import { spawn } from 'node:child_process'

// Every app's e2e dev server, keyed by its Playwright port (see each app's playwright.config.js).
// Cross-app calls during local/e2e dev are routed to these local ports (see setup_env.ts's "local
// port discovery"), so when the whole suite runs together, one app's Playwright process can start
// making requests to a sibling app's server before that server has finished booting -- an
// ECONNREFUSED race. Starting every app's `dev:e2e` server up front (outside any single app's own
// Playwright-managed lifecycle, so a fast app finishing early can't tear its server down before a
// slower sibling even starts) and waiting for all of them to answer HTTP requests before running
// any test removes the race, the same way a Docker Compose service waits on its dependencies'
// healthchecks before starting.
const dev_servers = [
	{ name: 'sources', port: 1947 },
	{ name: 'targets', port: 1382 },
	{ name: 'editor', port: 1337 },
	{ name: 'www', port: 1455 },
	{ name: 'ontology', port: 3056 },
	{ name: 'copilot', port: 9000 },
]

const READY_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 500

async function is_healthy(port: number): Promise<boolean> {
	try {
		await fetch(`http://localhost:${port}/`)
		return true
	} catch {
		return false
	}
}

async function wait_for_dev_servers(): Promise<void> {
	const deadline = Date.now() + READY_TIMEOUT_MS
	const pending = new Set(dev_servers.map(server => server.name))

	while (pending.size > 0) {
		if (Date.now() > deadline) {
			throw new Error(`Timed out waiting for dev servers to become healthy: ${[...pending].join(', ')}`)
		}

		await Promise.all(
			dev_servers.filter(server => pending.has(server.name)).map(async server => {
				if (await is_healthy(server.port)) {
					pending.delete(server.name)
					console.log(`✅ ${server.name} is up (port ${server.port})`)
				}
			}),
		)

		if (pending.size > 0) {
			await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
		}
	}
}

function run({ command, args }: {
	command: string
	args: string[]
}): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'inherit' })
		child.on('error', reject)
		child.on('exit', code => resolve(code ?? 1))
	})
}

// A scoped invocation (e.g. `bun run test:e2e --filter=@tabitha/copilot`) only touches one app, so it
// doesn't need cross-app readiness gating -- that app's own Playwright webServer (`dev:e2e`)
// already handles starting/reusing its own server. Only the full, unfiltered run needs this.
const extra_args = process.argv.slice(2)
if (extra_args.length > 0) {
	const code = await run({ command: 'bunx', args: ['turbo', 'run', 'test:e2e', '--continue=dependencies-successful', ...extra_args] })
	process.exit(code)
}

console.log('🚀 Starting every app\'s e2e dev server...')
const dev_server_process = spawn('bunx', ['turbo', 'run', 'dev:e2e'], { stdio: 'inherit', detached: true })

function shut_down_dev_servers(): void {
	if (dev_server_process.pid) {
		process.kill(-dev_server_process.pid, 'SIGTERM')
	}
}

let exit_code: number
try {
	console.log('⏳ Waiting for every dev server to report healthy before running e2e tests...')
	await wait_for_dev_servers()

	console.log('🎭 All dev servers are healthy -- running the Playwright e2e suite...')
	exit_code = await run({ command: 'bunx', args: ['turbo', 'run', 'test:e2e', '--continue=dependencies-successful'] })
} finally {
	shut_down_dev_servers()
}

process.exit(exit_code)
