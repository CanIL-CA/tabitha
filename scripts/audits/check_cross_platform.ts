import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

// Scoped to scripts/ and tools/ (Bun-run DX tooling, executed directly on a developer's own OS)
// rather than apps/packages -- those ship to Cloudflare Workers, which is OS-agnostic, so this
// class of bug can only ever bite local tooling. See docs/decisions/0011-windows-db-load-node-fallback.md
// for the two real bugs (a POSIX-only shell pipe, and a multi-segment Glob pattern) this check
// generalizes from.
const SEARCH_DIRS = [join(root_dir, 'scripts'), join(root_dir, 'tools')]

// Where this check's rationale and remediation guidance is documented.
const DOC_LINK = 'AGENTS.md#writing-cross-platform-scripts--tools'

type CrossPlatformFinding = {
	file_path: string
	line_number: number
	message: string
	snippet: string
}

const findings: CrossPlatformFinding[] = []

async function get_script_files(dir: string): Promise<string[]> {
	if (!existsSync(dir)) return []
	const files: string[] = []
	const entries = await readdir(dir, { withFileTypes: true })
	for (const entry of entries) {
		const full_path = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') continue
			files.push(...await get_script_files(full_path))
		// .test.ts files are deliberately included: they run on a developer's own OS like any other
		// script here, and issue #105's actual Windows failure was a locked sqlite handle in a test's
		// own fixture helper, not in the code under test.
		} else if (entry.name.endsWith('.ts') || entry.name.endsWith('.mjs')) {
			files.push(full_path)
		}
	}
	return files
}

// Bun's Glob returns the traversed-directory portion of a match using the OS-native separator
// (backslash on Windows) whenever that directory is baked into the pattern itself instead of
// passed as the scan root -- even though the pattern used a forward slash. A pattern with no `/`
// in it can only ever match a bare filename, sidestepping the issue entirely (see
// resolve_dated_file.ts for the established safe shape: scan from the directory, reconstruct the
// path manually).
function check_multi_segment_glob({ file_path, lines }: {
	file_path: string
	lines: string[]
}) {
	lines.forEach((line, idx) => {
		const match = line.match(/new Glob\(\s*(`[^`]*`|'[^']*'|"[^"]*")/)
		if (!match) return
		const pattern = match[1].slice(1, -1)
		if (pattern.includes('/')) {
			findings.push({
				file_path,
				line_number: idx + 1,
				snippet: line.trim(),
				message: 'Glob pattern spans multiple path segments (contains "/"). Scan from the directory instead (e.g. `.scanSync(dir)` with a bare-filename pattern) and reconstruct the path manually, or the match may come back with backslashes on Windows.',
			})
		}
	})
}

// A command string built for a POSIX shell (pipes, &&, ; chaining) handed to execSync/execFileSync
// won't parse under cmd.exe, execSync's default shell on Windows.
function check_posix_shell_syntax({ file_path, lines }: {
	file_path: string
	lines: string[]
}) {
	lines.forEach((line, idx) => {
		if (!/\bexec(?:File)?Sync\(/.test(line)) return
		const match = line.match(/exec(?:File)?Sync\(\s*(`[^`]*`|'[^']*'|"[^"]*")/)
		if (!match) return
		const command = match[1].slice(1, -1)
		if (/[|;]|&&/.test(command)) {
			findings.push({
				file_path,
				line_number: idx + 1,
				snippet: line.trim(),
				message: 'Command string uses POSIX shell syntax (pipe, &&, or ;), which cmd.exe (execSync\'s default shell on Windows) can\'t parse. Build the input in JS and pass it via the `input` option, or invoke the target binary directly without shell chaining.',
			})
		}
	})
}

// /tmp, /var, /usr, and /etc don't exist on Windows -- os.tmpdir() (or a path relative to the
// project) is the portable equivalent.
function check_hardcoded_posix_paths({ file_path, lines }: {
	file_path: string
	lines: string[]
}) {
	lines.forEach((line, idx) => {
		const match = line.match(/[`'"](\/(?:tmp|var|usr|etc)\/[^`'"]*)[`'"]/)
		if (!match) return
		findings.push({
			file_path,
			line_number: idx + 1,
			snippet: line.trim(),
			message: `Hardcoded POSIX-only path "${match[1]}" doesn't exist on Windows. Use os.tmpdir() or a path relative to the project instead.`,
		})
	})
}

// A bun:sqlite Database opened at module top-level in a one-shot CLI script -- or inside a
// top-level if/for block there -- is fine left unclosed -- the process exits right after,
// reclaiming the handle on any OS. But one opened inside a genuinely nested function (two or
// more indentation levels deep, per this repo's tabs-for-indentation convention) can be called
// repeatedly from a still-running process -- e.g. imported and invoked by a unit test that then
// tries to clean up a temp dir containing that same file. POSIX allows unlinking an open file;
// Windows holds a real lock until the handle is actually released, so this only breaks there.
//
// Note it specifically wants `close(true)`, not a bare `close()`: the default is sqlite3_close_v2,
// which only releases the connection once every statement (including the ones .query() caches) is
// finalized or garbage collected. That deferred release is prompt enough on macOS/Linux to look
// like it worked, while still leaving the file locked on Windows -- exactly the false-negative
// that made issue #105's failing test look fixed when it wasn't. `close(true)` finalizes
// everything and closes immediately.
//
// The 2-tab threshold is a proxy, not real scope analysis: it's low enough to miss a
// directly-nested function some call sites won't reach, and it can't see a handle closed by the
// function's *caller* either -- a heuristic nudge, not a guarantee, same as the other checks here.
function check_unclosed_database_handle({ file_path, content, lines }: {
	file_path: string
	content: string
	lines: string[]
}) {
	// A test file is never a one-shot script -- the runner process outlives each individual test, so
	// any function-scoped handle (1 tab) is a risk there. Elsewhere, require 2 tabs so a CLI script's
	// own top-level if/for blocks don't read as reusable functions.
	const min_indent = file_path.endsWith('.test.ts') ? /^\t/ : /^\t\t/

	lines.forEach((line, idx) => {
		if (!min_indent.test(line)) return // shallower than this is top-level script flow -- see comment above
		const match = line.match(/(?:const|let)\s+(\w+)\s*=\s*new Database\(/)
		if (!match) return
		const var_name = match[1]
		if (/:memory:/.test(line)) return // in-memory databases have no file to lock

		const closed_deterministically = new RegExp(`\\b${var_name}\\.close\\(\\s*true\\s*\\)`).test(content)
		if (closed_deterministically) return

		const closed_loosely = new RegExp(`\\b${var_name}\\.close\\(`).test(content)
		findings.push({
			file_path,
			line_number: idx + 1,
			snippet: line.trim(),
			message: closed_loosely
				? `"${var_name}" is closed with a bare .close(), which defers the actual release until every statement is finalized or garbage collected (sqlite3_close_v2). On Windows the file stays locked until that happens, so deleting it (or its directory) can still fail with EBUSY even though this looks closed on macOS/Linux. Use .close(true) to finalize and release immediately.`
				: `"${var_name}" is opened inside a function/loop but never closed in this file. On Windows, an open sqlite handle holds a real file lock -- if this runs more than once in a still-live process (e.g. a unit test cleaning up its own temp dir), the next attempt to touch that file/directory can fail with EBUSY. Call .close(true) once this handle is done with, or confirm the caller takes ownership of closing it.`,
		})
	})
}

async function audit_cross_platform_tooling() {
	console.log(`
============================================================
    🖥️  TaBiThA Cross-Platform DX Tooling Audit
============================================================
`)

	const all_files = (await Promise.all(SEARCH_DIRS.map(get_script_files))).flat()
	console.log(`🔍 Auditing ${all_files.length} script(s)/tool(s) for OS-specific assumptions...\n`)

	for (const file_path of all_files) {
		const content = await readFile(file_path, 'utf-8')
		const lines = content.split('\n')
		check_multi_segment_glob({ file_path, lines })
		check_posix_shell_syntax({ file_path, lines })
		check_unclosed_database_handle({ file_path, content, lines })
		check_hardcoded_posix_paths({ file_path, lines })
	}

	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	if (findings.length === 0) {
		console.log(`✅ 100% Portable! No OS-specific assumptions detected across ${all_files.length} script(s)/tool(s).\n`)
		return
	}

	console.log(`⚠️  Found ${findings.length} cross-platform observation(s):\n`)

	for (const f of findings) {
		const rel_path = relative(root_dir, f.file_path)
		console.log('[Cross-Platform]')
		console.log(`  📄 ${rel_path}:${f.line_number}`)
		console.log(`  💡 ${f.message}`)
		console.log(`  🔎 "${f.snippet}"`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::warning file=${rel_path},line=${f.line_number},title=Cross-Platform Observation::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${findings.length} non-blocking observation(s) reported across ${all_files.length} script(s)/tool(s).\n`)
}

if (import.meta.main) {
	await audit_cross_platform_tooling()
}
