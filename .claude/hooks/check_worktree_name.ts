// VS Code's Git extension hides any worktree whose folder name starts with one of these
// prefixes from the Source Control panel while the parent repo is open, assuming GitHub
// Copilot created it (isCopilotWorktreeFolder in microsoft/vscode extensions/git/src/util.ts).
// Checked both when EnterWorktree creates a worktree and when a shell command does it with
// `git worktree add` or `git worktree move`, since the hook can't otherwise see the latter.
const VSCODE_HIDDEN_WORKTREE_PREFIXES = ['copilot-', 'agents-'] as const

// `git worktree add` options that take a value, so the value isn't mistaken for the path.
const OPTIONS_WITH_VALUE = new Set(['-b', '-B', '--reason'])

type HookInput = {
	readonly tool_name?: string
	readonly tool_input?: { readonly name?: string, readonly command?: string }
}

const find_hidden_prefix = (worktree_path: string): string | undefined => {
	const folder_name = worktree_path.replace(/\/+$/, '').split('/').at(-1) ?? ''
	return VSCODE_HIDDEN_WORKTREE_PREFIXES.find(prefix => folder_name.startsWith(prefix))
}

/** The folder each `git worktree add` or `git worktree move` in a shell command would create. */
function worktree_paths_in(command: string): string[] {
	return command.split(/&&|\|\||[;|\n]/).flatMap(segment => {
		const words = segment.trim().split(/\s+/).map(word => word.replace(/^["']|["']$/g, ''))
		const worktree_at = words.indexOf('worktree')
		if (worktree_at === -1 || !words.slice(0, worktree_at).includes('git')) return []

		const [subcommand, ...rest] = words.slice(worktree_at + 1)
		const positional = rest.filter((word, index) => !word.startsWith('-') && !OPTIONS_WITH_VALUE.has(rest[index - 1] ?? ''))
		// add <path> [<commit-ish>]; move <worktree> <new-path>
		if (subcommand === 'add') return positional.slice(0, 1)
		if (subcommand === 'move') return positional.slice(1, 2)
		return []
	})
}

const hook_input: HookInput = JSON.parse(await Bun.stdin.text())
const worktree_paths = hook_input.tool_name === 'Bash'
	? worktree_paths_in(hook_input.tool_input?.command ?? '')
	: [hook_input.tool_input?.name ?? '']

for (const worktree_path of worktree_paths) {
	const hidden_prefix = find_hidden_prefix(worktree_path)
	if (!hidden_prefix) continue

	process.stderr.write(
		`Worktree name "${worktree_path}" starts with "${hidden_prefix}", which VS Code hides from the `
		+ 'Source Control panel. Pick a name with the scope later instead (e.g. "fix-copilot-..."). '
		+ 'See AGENTS.md "Worktree naming".\n',
	)
	process.exit(2)
}
