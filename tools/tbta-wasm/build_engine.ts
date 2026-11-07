// Builds TBTA's generation engine as a Worker-ready WebAssembly module.
// Checks out CanIL-CA/tbta at TBTA_COMMIT into .tbta/, applies tbta.patch (encoding passed in as a
// string, no threads, ES module output), builds with Emscripten, and copies the result into
// apps/generator/engine/. Needs git (with access to the private repo), emcmake, cmake and ninja.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { write_gzipped_copy } from './gzipped_copy'
import { CMAKE_PRESET, ENGINE_JS, ENGINE_OUTPUT_DIR, ENGINE_WASM, TBTA_CLONE_DIR, TBTA_COMMIT, TBTA_REPO_URL, TOOL_DIR } from './paths'

const REQUIRED_TOOLS = ['git', 'emcmake', 'cmake', 'ninja']
const INSTALL_HINT = 'Install Emscripten, CMake and Ninja first (macOS: `brew install emscripten cmake ninja`; Windows: emsdk from https://emscripten.org plus CMake and Ninja on PATH).'

function resolve_tools() {
	const missing = REQUIRED_TOOLS.filter(tool => !Bun.which(tool))
	if (missing.length > 0) throw new Error(`Missing ${missing.join(', ')}. ${INSTALL_HINT}`)
	return Object.fromEntries(REQUIRED_TOOLS.map(tool => [tool, Bun.which(tool) as string]))
}

function run({ command, cwd }: { command: string[], cwd: string }) {
	console.log(`$ ${command.join(' ')}`)
	const result = Bun.spawnSync(command, { cwd, stdio: ['inherit', 'inherit', 'inherit'] })
	if (result.exitCode !== 0) throw new Error(`Command failed (exit ${result.exitCode}): ${command.join(' ')}`)
}

function check_out_tbta({ git }: { git: string }) {
	mkdirSync(TBTA_CLONE_DIR, { recursive: true })
	if (!existsSync(join(TBTA_CLONE_DIR, '.git'))) {
		run({ command: [git, 'init', '--quiet'], cwd: TBTA_CLONE_DIR })
		run({ command: [git, 'remote', 'add', 'origin', TBTA_REPO_URL], cwd: TBTA_CLONE_DIR })
	}
	run({ command: [git, 'fetch', '--quiet', '--depth', '1', 'origin', TBTA_COMMIT], cwd: TBTA_CLONE_DIR })
	run({ command: [git, 'checkout', '--quiet', '--force', TBTA_COMMIT], cwd: TBTA_CLONE_DIR })
	// Back to a pristine tree so the patch applies cleanly, keeping the build cache and the
	// third-party sources CMake downloads (both slow to recreate).
	run({ command: [git, 'clean', '--quiet', '-fdx', '-e', '/build/', '-e', '/external/'], cwd: TBTA_CLONE_DIR })
	run({ command: [git, 'apply', join(TOOL_DIR, 'tbta.patch')], cwd: TBTA_CLONE_DIR })
	copyFileSync(join(TOOL_DIR, 'CMakeUserPresets.json'), join(TBTA_CLONE_DIR, 'CMakeUserPresets.json'))
}

function build_engine({ emcmake, cmake }: { emcmake: string, cmake: string }) {
	run({ command: [emcmake, cmake, '--preset', CMAKE_PRESET], cwd: TBTA_CLONE_DIR })
	run({ command: [cmake, '--build', '--preset', CMAKE_PRESET], cwd: TBTA_CLONE_DIR })
}

function copy_engine() {
	const build_dir = join(TBTA_CLONE_DIR, 'build', CMAKE_PRESET, 'BrowserTest')
	mkdirSync(ENGINE_OUTPUT_DIR, { recursive: true })
	copyFileSync(join(build_dir, 'BrowserTest.js'), join(ENGINE_OUTPUT_DIR, ENGINE_JS))
	copyFileSync(join(build_dir, 'BrowserTest.wasm'), join(ENGINE_OUTPUT_DIR, ENGINE_WASM))
	write_gzipped_copy({ name: ENGINE_WASM })
	console.log(`Engine written to ${ENGINE_OUTPUT_DIR}`)
}

const tools = resolve_tools()
check_out_tbta({ git: tools.git })
build_engine({ emcmake: tools.emcmake, cmake: tools.cmake })
copy_engine()
