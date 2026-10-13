import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The tracked .claude/settings.json is the single source of truth for which Claude Code plugins
// this repo expects. Enabling a plugin there doesn't download it, so `bun run setup` installs
// whatever is missing and `bun run doctor` reports it.

type MarketplaceSource =
	| { source: 'github', repo: string }
	| { source: 'git' | 'url', url: string }

type ClaudeProjectSettings = {
	extraKnownMarketplaces?: Record<string, { source: MarketplaceSource }>
	enabledPlugins?: Record<string, boolean>
}

export type ProjectPlugin = {
	plugin_id: string
	marketplace_name: string
	marketplace_source?: string
}

const marketplace_source_arg = (source: MarketplaceSource): string =>
	source.source === 'github' ? source.repo : source.url

export function parse_project_plugins({ settings_json }: { settings_json: string }): ProjectPlugin[] {
	const settings = JSON.parse(settings_json) as ClaudeProjectSettings
	const marketplaces = settings.extraKnownMarketplaces ?? {}

	return Object.entries(settings.enabledPlugins ?? {})
		.filter(([, enabled]) => enabled)
		.map(([plugin_id]) => {
			const marketplace_name = plugin_id.split('@')[1] ?? ''
			const marketplace = marketplaces[marketplace_name]
			return {
				plugin_id,
				marketplace_name,
				marketplace_source: marketplace && marketplace_source_arg(marketplace.source),
			}
		})
}

export function read_project_plugins({ root_dir }: { root_dir: string }): ProjectPlugin[] {
	const settings_path = join(root_dir, '.claude', 'settings.json')
	if (!existsSync(settings_path)) return []
	return parse_project_plugins({ settings_json: readFileSync(settings_path, 'utf-8') })
}

export function find_missing_plugins({ project_plugins, installed_ids }: { project_plugins: ProjectPlugin[], installed_ids: Set<string> }): ProjectPlugin[] {
	return project_plugins.filter(plugin => !installed_ids.has(plugin.plugin_id))
}

export const is_claude_cli_available = (): boolean => Bun.which('claude') !== null

// Arguments go straight to the binary (no shell string), so this behaves the same on Windows.
async function run_claude({ args }: { args: string[] }): Promise<{ ok: boolean, stdout: string }> {
	const proc = Bun.spawn(['claude', ...args], { stdout: 'pipe', stderr: 'pipe' })
	const [stdout, exit_code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
	return { ok: exit_code === 0, stdout }
}

export async function list_installed_plugin_ids(): Promise<Set<string> | null> {
	const { ok, stdout } = await run_claude({ args: ['plugin', 'list', '--json'] })
	if (!ok) return null
	const plugins = JSON.parse(stdout) as { id: string }[]
	return new Set(plugins.map(plugin => plugin.id))
}

async function list_marketplace_names(): Promise<Set<string>> {
	const { ok, stdout } = await run_claude({ args: ['plugin', 'marketplace', 'list', '--json'] })
	if (!ok) return new Set()
	const marketplaces = JSON.parse(stdout) as { name: string }[]
	return new Set(marketplaces.map(marketplace => marketplace.name))
}

export async function install_project_plugin({ plugin }: { plugin: ProjectPlugin }): Promise<boolean> {
	const known_marketplaces = await list_marketplace_names()
	if (!known_marketplaces.has(plugin.marketplace_name)) {
		if (!plugin.marketplace_source) return false
		const added = await run_claude({ args: ['plugin', 'marketplace', 'add', plugin.marketplace_source] })
		if (!added.ok) return false
	}

	const installed = await run_claude({ args: ['plugin', 'install', plugin.plugin_id, '--scope', 'project'] })
	return installed.ok
}
