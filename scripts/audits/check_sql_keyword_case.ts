import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

// Convention: SQL keywords are written in ALL CAPS (CONTRIBUTING.md, "SQL"). SQL lives in .sql
// migrations and also in string/template literals in .ts, .js and .svelte files, so both get scanned.
const DOC_LINK = 'CONTRIBUTING.md'

// Files a tool generates, which keep the generator's casing. Regenerating would undo any edit.
const GENERATED_FILES = new Set([
	'apps/ontology/migrations/auth/0001_better_auth.sql',
])

// Skipped so the audit's own fixtures, which spell out lowercase SQL on purpose, don't fail it.
const SELF_FILES = new Set([
	'scripts/audits/check_sql_keyword_case.ts',
	'scripts/audits/check_sql_keyword_case.test.ts',
])

const SQL_EXTENSIONS = new Set(['.sql'])
const SCRIPT_EXTENSIONS = new Set(['.ts', '.js', '.svelte'])

// Only words that are unambiguous SQL keywords. Words that are just as likely to be a column or
// variable name (key, index, end, set, text, default, ...) are left out so lowercase identifiers
// aren't flagged; they get checked by being next to a keyword that is on this list.
const KEYWORDS = new Set([
	'select', 'from', 'where', 'insert', 'into', 'values', 'update', 'delete', 'create', 'alter', 'drop',
	'table', 'join', 'inner', 'outer', 'group', 'order', 'having', 'limit', 'offset', 'distinct', 'union',
	'and', 'or', 'not', 'null', 'like', 'between', 'exists', 'case', 'when', 'then', 'else', 'primary',
	'references', 'unique', 'ignore', 'returning', 'cascade', 'pragma', 'integer', 'blob', 'desc', 'asc',
])

// A literal is SQL when it opens like a statement; fragments like "WHERE x = 1" and prose like
// "select the verse from the list" (more than a column list before FROM) are left alone.
const STATEMENT_START = /^\s*(?:select\s+(?:distinct\s+)?(?:\*|[^\s,]+(?:\s+as\s+\w+)?(?:\s*,\s*[^\s,]+(?:\s+as\s+\w+)?)*)\s+from\b|insert\s+(?:or\s+\w+\s+)?into\b|update\s+\S+\s+set\b|delete\s+from\b|create\s+(?:unique\s+)?(?:virtual\s+)?(?:table|index|view|trigger)\b|alter\s+table\b|drop\s+(?:table|index|view)\b|pragma\b|with\s+\w+\s+as\s*\()/i

export type SqlKeywordFinding = {
	readonly file_path: string
	readonly line: number
	readonly keyword: string
}

export type SourceLiteral = {
	readonly text: string
	readonly line: number
}

const blank = (text: string) => text.replace(/[^\n]/g, ' ')

function count_newlines(text: string) {
	return text.split('\n').length - 1
}

function read_literal({ source, start }: { source: string; start: number }) {
	const quote = source[start]
	let index = start + 1
	let text = ''
	while (index < source.length) {
		const char = source[index]
		if (char === '\\') {
			text += char + (source[index + 1] ?? '')
			index += 2
		} else if (char === quote) {
			return { text, end: index + 1 }
		} else if (char === '\n' && quote !== '`') {
			return { text, end: index }
		} else if (quote === '`' && char === '$' && source[index + 1] === '{') {
			let depth = 1
			let hole_end = index + 2
			while (hole_end < source.length && depth > 0) {
				if (source[hole_end] === '{') depth++
				if (source[hole_end] === '}') depth--
				hole_end++
			}
			text += blank(source.slice(index, hole_end))
			index = hole_end
		} else {
			text += char
			index++
		}
	}
	return { text, end: index }
}

/** The string and template literals of JS/TS source, comments skipped and `${}` holes blanked. */
export function extract_literals(source: string): SourceLiteral[] {
	const literals: SourceLiteral[] = []
	let line = 1
	let index = 0
	while (index < source.length) {
		const char = source[index]
		const next = source[index + 1]
		if (char === '/' && next === '/') {
			const end = source.indexOf('\n', index)
			index = end === -1 ? source.length : end
		} else if (char === '/' && next === '*') {
			const close = source.indexOf('*/', index + 2)
			const end = close === -1 ? source.length : close + 2
			line += count_newlines(source.slice(index, end))
			index = end
		} else if (char === '\'' || char === '"' || char === '`') {
			const { text, end } = read_literal({ source, start: index })
			literals.push({ text, line })
			line += count_newlines(source.slice(index, end))
			index = end
		} else {
			if (char === '\n') line++
			index++
		}
	}
	return literals
}

/** The text between a Svelte file's <script> tags, padded so line numbers still match the file. */
export function extract_svelte_script(source: string) {
	return source.replace(/(<script[^>]*>)([\s\S]*?)(<\/script>)|[\s\S]/g, (match, open?: string, code?: string, close?: string) => code === undefined ? blank(match) : blank(open!) + code + blank(close!))
}

// Comments and quoted text can hold any word, so they are blanked before keywords are looked for.
const MASKED = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`/g

/** Lowercase SQL keywords in `sql`, as { line, keyword } with line counted from 1 within `sql`. */
export function find_lowercase_keywords(sql: string) {
	const masked = sql.replace(MASKED, blank)
	const found: { line: number; keyword: string }[] = []
	for (const match of masked.matchAll(/\b[a-z]+\b/g)) {
		const keyword = match[0]
		if (!KEYWORDS.has(keyword)) continue
		const before = masked[match.index - 1]
		const after = masked[match.index + keyword.length]
		// A dotted name (t.order) or a call (left(...)) is an identifier or function, not a keyword.
		if (before === '.' || after === '(' || after === ':') continue
		found.push({ line: count_newlines(masked.slice(0, match.index)) + 1, keyword })
	}
	return found
}

export function find_sql_keyword_findings({ file_path, content }: {
	file_path: string
	content: string
}): SqlKeywordFinding[] {
	if (GENERATED_FILES.has(file_path) || SELF_FILES.has(file_path)) return []
	const extension = extname(file_path)

	if (SQL_EXTENSIONS.has(extension)) {
		return find_lowercase_keywords(content).map(({ line, keyword }) => ({ file_path, line, keyword }))
	}
	if (!SCRIPT_EXTENSIONS.has(extension)) return []

	const source = extension === '.svelte' ? extract_svelte_script(content) : content
	return extract_literals(source)
		.filter(({ text }) => STATEMENT_START.test(text))
		.flatMap(literal => find_lowercase_keywords(literal.text).map(({ line, keyword }) => ({
			file_path,
			line: literal.line + line - 1,
			keyword,
		})))
}

function get_candidate_files() {
	const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
	return listed.split('\n').filter(path => path && [...SQL_EXTENSIONS, ...SCRIPT_EXTENSIONS].includes(extname(path)))
}

function audit_sql_keyword_case() {
	console.log(`
============================================================
    🔠 TaBiThA SQL Keyword Case Audit
============================================================
`)

	const files = get_candidate_files()
	console.log(`🔍 Checking ${files.length} .sql/.ts/.js/.svelte file(s) for lowercase SQL keywords\n`)

	const findings = files.flatMap(file_path => find_sql_keyword_findings({ file_path, content: readFileSync(file_path, 'utf-8') }))
	if (findings.length === 0) {
		console.log('✅ 100% Clean! Every SQL keyword is in ALL CAPS.\n')
		return true
	}

	const is_ci = process.env.GITHUB_ACTIONS === 'true'
	for (const { file_path, line, keyword } of findings) {
		const message = `Write the SQL keyword "${keyword}" as "${keyword.toUpperCase()}".`
		console.log(`[❌ sql-case]  📄 ${file_path}:${line}  💡 ${message}`)
		if (is_ci) {
			console.log(`::error file=${file_path},line=${line},title=SQL keyword case::${message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`\n📋 Summary: ${findings.length} lowercase keyword(s) across ${new Set(findings.map(finding => finding.file_path)).size} file(s). 📚 ${DOC_LINK}\n`)
	return false
}

if (import.meta.main) {
	const passed = audit_sql_keyword_case()
	if (!passed) {
		process.exit(1)
	}
}
