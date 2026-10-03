import { describe, expect, test } from 'bun:test'
import { find_missing_plugins, parse_project_plugins } from './claude_plugins'

describe('parse_project_plugins', () => {
	test('resolves each enabled plugin to its marketplace source', () => {
		const settings_json = JSON.stringify({
			extraKnownMarketplaces: { daisyui: { source: { source: 'github', repo: 'saadeghi/daisyui' } } },
			enabledPlugins: { 'daisyui@daisyui': true },
		})

		expect(parse_project_plugins({ settings_json })).toEqual([
			{ plugin_id: 'daisyui@daisyui', marketplace_name: 'daisyui', marketplace_source: 'saadeghi/daisyui' },
		])
	})

	test('skips plugins the project disables', () => {
		const settings_json = JSON.stringify({ enabledPlugins: { 'a@m': false, 'b@m': true } })

		expect(parse_project_plugins({ settings_json }).map(plugin => plugin.plugin_id)).toEqual(['b@m'])
	})

	test('leaves the source undefined for a marketplace the project does not declare', () => {
		const settings_json = JSON.stringify({ enabledPlugins: { 'tool@elsewhere': true } })

		expect(parse_project_plugins({ settings_json })[0]?.marketplace_source).toBeUndefined()
	})

	test('returns nothing when the settings enable no plugins', () => {
		expect(parse_project_plugins({ settings_json: JSON.stringify({ hooks: {} }) })).toEqual([])
	})
})

describe('find_missing_plugins', () => {
	test('returns only plugins that are not installed', () => {
		const project_plugins = [
			{ plugin_id: 'daisyui@daisyui', marketplace_name: 'daisyui' },
			{ plugin_id: 'other@m', marketplace_name: 'm' },
		]

		const missing = find_missing_plugins({ project_plugins, installed_ids: new Set(['other@m']) })

		expect(missing.map(plugin => plugin.plugin_id)).toEqual(['daisyui@daisyui'])
	})
})
