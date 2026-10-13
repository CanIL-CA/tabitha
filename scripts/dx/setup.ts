import { $ } from 'bun'
import { platform } from 'node:os'
import { load_database } from './db_load'
import { find_missing_plugins, install_project_plugin, is_claude_cli_available, list_installed_plugin_ids, read_project_plugins } from './lib/claude_plugins'
import { load_r2 } from './r2_load'
import { setup_env } from './setup_env'

async function check_sqlite_prerequisite(): Promise<boolean> {
	try {
		const sqlite_proc = await $`sqlite3 --version`.quiet()
		const sqlite_version = sqlite_proc.text().trim().split(' ')[0]
		console.log(`🗄️  SQLite3 Engine: v${sqlite_version} (verified!)\n`)
		return true
	} catch {
		const os_type = platform()
		console.error('\n❌ SQLite3 CLI (`sqlite3`) is required for local database bootstrapping but was not found in your PATH.')
		if (os_type === 'win32') {
			console.error('   👉 Install on Windows: winget install sqlite.sqlite (or choco install sqlite)\n')
		} else if (os_type === 'darwin') {
			console.error('   👉 Install on macOS: brew install sqlite\n')
		} else {
			console.error('   👉 Install on Linux: sudo apt-get install -y sqlite3\n')
		}
		return false
	}
}

async function install_claude_plugins() {
	const project_plugins = read_project_plugins({ root_dir: process.cwd() })
	if (project_plugins.length === 0) return

	if (!is_claude_cli_available()) {
		console.log('🤖 Claude Code CLI not found -- skipping the project\'s Claude Code plugins (only needed if you use Claude Code).\n')
		return
	}

	const installed_ids = await list_installed_plugin_ids()
	if (!installed_ids) {
		console.warn('⚠️  Could not list installed Claude Code plugins; skipping. Run `bun run doctor` to re-check.\n')
		return
	}

	const missing = find_missing_plugins({ project_plugins, installed_ids })
	if (missing.length === 0) {
		console.log('🤖 Claude Code plugins already installed.\n')
		return
	}

	for (const plugin of missing) {
		console.log(`🤖 Installing Claude Code plugin ${plugin.plugin_id}...`)
		const installed = await install_project_plugin({ plugin })
		if (installed) {
			console.log(`   ✅ Installed ${plugin.plugin_id}\n`)
		} else {
			console.warn(`   ⚠️  Could not install ${plugin.plugin_id}. Install it from Claude Code with: /plugin install ${plugin.plugin_id}\n`)
		}
	}
}

async function setup_workspace() {
	console.log(`
============================================================
           🚀 Welcome to the TaBiThA Monorepo!              
============================================================
`)

	// 1. Setup local environment files
	await setup_env()

	// 2. Verify SQLite3 CLI prerequisite
	const sqlite_ready = await check_sqlite_prerequisite()
	if (!sqlite_ready) {
		console.warn('⚠️  Skipping database bootstrapping until SQLite3 CLI is installed.\n')
	}

	// 3. Configure Git pre-commit security hook & commit template
	try {
		await $`git config core.hooksPath .githooks`.quiet()
		await $`git config commit.template .gitmessage`.quiet()
		console.log('🔒 Configured Git pre-commit hook (.githooks) & commit template (.gitmessage)\n')
	} catch {
		// Non-git environment
	}

	// 4. Load latest SQLite / D1 databases, then seed local R2 buckets from them
	if (sqlite_ready) {
		console.log('📦 Fetching database snapshots from R2...')
		await $`bun --filter @tabitha/databases r2:pull -- snapshots`
		console.log('📦 Bootstrapping local D1 databases...')
		await load_database('all')
		console.log('🪣 Seeding local R2 bucket(s)...')
		await load_r2('all')
	}

	// 5. Install Playwright browsers for local e2e testing
	console.log('🎭 Installing Playwright Chromium browser...')
	try {
		await $`bun run test:e2e:install`
		console.log('✅ Playwright Chromium installed!\n')
	} catch (err) {
		console.warn('⚠️  Playwright browser install encountered an issue:', err instanceof Error ? err.message : err, '\n')
	}

	// 6. Install the Claude Code plugins the tracked .claude/settings.json enables
	await install_claude_plugins()

	// 7. Run workspace verification
	console.log('🔍 Running initial workspace verification check...')
	try {
		await $`bun run check`
		console.log('✅ Workspace checks passed cleanly!')
	} catch (err) {
		console.warn('⚠️  Verification encountered an issue:', err instanceof Error ? err.message : err)
	}

	console.log(`
============================================================
🎉 Setup Complete! You're ready to build with TaBiThA.

Local App Ports & Endpoints:
  • Ontology:  http://localhost:3056
  • Targets:   http://localhost:1382
  • Sources:   http://localhost:1947
  • Editor:    http://localhost:1337
  • Copilot:   http://localhost:9000

Useful Commands:
  • bun run dev              Start all applications in parallel
  • bun run dev:<app>        Start a single application (e.g. bun run dev:ontology)
  • bun run check            Run typecheck & linting across all packages
  • bun run test:unit        Run all unit test suites
  • bun run test:e2e         Run Playwright end-to-end tests
  • bun run db:load          Reload all D1 databases from snapshots
  • bun run r2:load          Reseed local R2 bucket(s) from the local D1 database(s)
  • bun run db:grant <email> Grant yourself Ontology permissions locally (see below)

⚠️  Ontology only: after signing in with Google locally for the first time, a
   401 on /protected pages is expected -- your local Auth DB starts with no
   user grants. Fix it once with: bun run db:grant your.email@example.com

🧪 60-Second Golden Path Smoke Test:
  1. Start all dev servers: \`bun run dev\`
  2. Open Editor: http://localhost:1337
  3. Type 'Paul write-A a letter.' into the text box and click Check
  4. Click the 'write-A' token, then the 'write-A' link in the popup
     (navigates to Ontology at :3056)
  5. Expand any 'Usage Example' accordion in Ontology:
     • Verifies Sources (:1947) -> Fetches semantic tree
     • Verifies Targets (:1382) -> Fetches generated English text
============================================================
`)
}

if (import.meta.main) {
	await setup_workspace()
}
