import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')

export type WorkflowFinding = {
	readonly rule_name: string
	readonly file_path: string
	readonly line_number: number
	readonly snippet: string
	readonly message: string
}

// Where this check's rationale and remediation steps are documented.
const DOC_LINK = '.claude/skills/github-actions/SKILL.md'

// A GitHub token input or env var fed from any secret other than the built-in GITHUB_TOKEN.
const SECRET_AS_GITHUB_TOKEN_REGEX = /^\s*(?:github-token|token|GH_TOKEN|GITHUB_TOKEN)\s*:\s*\$\{\{\s*secrets\.(?!GITHUB_TOKEN\b)(\w+)\s*\}\}/
const TOP_LEVEL_PERMISSIONS_REGEX = /^permissions\s*:/m

const is_yaml_file = (name: string): boolean => name.endsWith('.yml') || name.endsWith('.yaml')

async function list_yaml_files(dir: string): Promise<string[]> {
	if (!existsSync(dir)) return []
	const entries = await readdir(dir, { withFileTypes: true, recursive: true })
	return entries
		.filter(entry => entry.isFile() && is_yaml_file(entry.name))
		.map(entry => join(entry.parentPath, entry.name))
}

export function find_secret_github_tokens({ file_path, content }: {
	file_path: string
	content: string
}): WorkflowFinding[] {
	return content.split('\n').flatMap((line, idx) => {
		const match = line.match(SECRET_AS_GITHUB_TOKEN_REGEX)
		if (!match) return []

		return [{
			rule_name: 'Secret Used as GitHub Token',
			file_path,
			line_number: idx + 1,
			snippet: line.trim(),
			message: `secrets.${match[1]} is passed where the built-in GITHUB_TOKEN would usually do. Grant the job the permission it needs (e.g. \`permissions: pull-requests: write\`) and drop the PAT; keep a PAT or App token only for what GITHUB_TOKEN can't do (another repo, triggering other workflows).`,
		}]
	})
}

export function find_missing_top_level_permissions({ file_path, content }: {
	file_path: string
	content: string
}): WorkflowFinding[] {
	if (TOP_LEVEL_PERMISSIONS_REGEX.test(content)) return []

	return [{
		rule_name: 'Missing Top-Level Permissions',
		file_path,
		line_number: 1,
		snippet: '',
		message: 'Declare a top-level `permissions:` block (usually `contents: read`) so every job starts from least privilege, and raise it per job where needed.',
	}]
}

export async function scan_github_actions(): Promise<{ scanned: number; findings: WorkflowFinding[] }> {
	const workflow_files = await list_yaml_files(join(root_dir, '.github', 'workflows'))
	const action_files = await list_yaml_files(join(root_dir, '.github', 'actions'))

	const workflow_findings = await Promise.all(workflow_files.map(async file_path => {
		const content = await readFile(file_path, 'utf-8')
		return [
			...find_secret_github_tokens({ file_path, content }),
			...find_missing_top_level_permissions({ file_path, content }),
		]
	}))
	const action_findings = await Promise.all(action_files.map(async file_path => {
		const content = await readFile(file_path, 'utf-8')
		return find_secret_github_tokens({ file_path, content })
	}))

	return {
		scanned: workflow_files.length + action_files.length,
		findings: [...workflow_findings, ...action_findings].flat(),
	}
}

async function audit_github_actions() {
	console.log(`
============================================================
      ⚙️  TaBiThA GitHub Actions Token & Permissions Audit
============================================================
`)

	const result = await scan_github_actions()

	console.log(`🔍 Scanning ${result.scanned} workflow/action file(s) for token and permissions hygiene...\n`)

	if (result.findings.length === 0) {
		console.log('✅ 100% Clean! Workflows use the built-in GITHUB_TOKEN with explicit permissions.\n')
		return true
	}

	console.log(`❌ Detected ${result.findings.length} workflow observation(s):\n`)

	const is_ci = process.env.GITHUB_ACTIONS === 'true'

	for (const f of result.findings) {
		const rel_path = relative(root_dir, f.file_path)
		console.log(`[GitHub Actions ERROR: ${f.rule_name}]`)
		console.log(`  📄 ${rel_path}:${f.line_number}`)
		console.log(`  💡 ${f.message}`)
		if (f.snippet) console.log(`  🔍 Snippet: "${f.snippet}"`)
		console.log(`  📚 ${DOC_LINK}\n`)

		if (is_ci) {
			console.log(`::error file=${rel_path},line=${f.line_number},title=GitHub Actions (${f.rule_name})::${f.message} (docs: ${DOC_LINK})`)
		}
	}

	console.log(`📋 Summary: ${result.findings.length} error(s) across ${result.scanned} files.\n`)
	return false
}

if (import.meta.main) {
	const passed = await audit_github_actions()
	if (!passed) {
		process.exit(1)
	}
}
