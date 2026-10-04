import { describe, expect, it, mock } from 'bun:test'
import { reconcile_workers } from './apply'
import { build_command, preview_deploy_command, production_deploy_command } from './config'

const credentials = { account_id: 'account-1', api_token: 'token-1' }

// Reuses apps/www as the fixture app -- derive_watch_paths reads a real package.json off disk,
// and www's dependency list is the smallest of the real apps.
const test_app = { worker_name: 'www', app_dir: 'www' }
const template_app = { worker_name: 'sources', app_dir: 'sources' }
const www_watch_paths = ['apps/www/*', 'packages/api-client/*', 'packages/types/*', 'packages/ui/*', 'packages/vite-config/*', 'package.json', 'bun.lock']

const git_repository = {
	provider_type: 'github',
	provider_account_id: '336682665',
	provider_account_name: 'CanIL-CA',
	repo_id: '680338472',
	repo_name: 'tabitha',
	branch: 'main',
	grant_id: null,
}

function matching_config(path_includes = www_watch_paths) {
	return {
		git_repository,
		production_settings: {
			build_command,
			deploy_command: production_deploy_command,
			build_caching_enabled: true,
			path_includes,
			build_token_uuid: 'build-token-1',
			environment_variables: { SKIP_DEPENDENCY_INSTALL: { value: 'true', is_secret: false } } as Record<string, { value: string; is_secret: boolean }>,
		},
		previews_enabled: false,
	}
}

type Config = ReturnType<typeof matching_config>

function json_response(result: unknown, status = 200, errors: unknown[] = []) {
	return new Response(JSON.stringify({ success: status < 400, errors, result }), { status })
}

const not_connected = () => json_response(null, 404, [{ code: 12040, message: 'No build configuration associated with that script tag was found for this account' }])

type Request = { method: string; url: string; body: unknown }

/** Fakes the account: `workers` maps each existing Worker's name to its build config, or `null`
 * for a Worker that isn't connected to the repo yet. */
function account_fetch(workers: Record<string, Config | null>, requests: Request[] = []): typeof fetch {
	return mock(async (url: string, init?: RequestInit) => {
		const method = init?.method ?? 'GET'
		requests.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined })

		if (method === 'GET' && url.endsWith('/workers/scripts')) {
			return json_response(Object.keys(workers).map(name => ({ id: name, tag: `tag-${name}` })))
		}
		const tag_match = url.match(/\/builds\/workers\/tag-(\w+)$/)
		if (method === 'GET' && tag_match) {
			const config = workers[tag_match[1]]
			return config ? json_response(config) : not_connected()
		}
		if (method === 'PATCH' || method === 'POST') return json_response({})
		throw new Error(`Unexpected request: ${method} ${url}`)
	}) as unknown as typeof fetch
}

const writes = (requests: Request[]) => requests.filter(request => request.method !== 'GET')

describe('reconcile_workers', () => {
	it('reports nothing to change when everything already matches', async () => {
		const requests: Request[] = []
		const [plan] = await reconcile_workers(credentials, { apply: true, apps: [test_app] }, account_fetch({ www: matching_config() }, requests))

		expect(plan).toEqual({ worker_name: 'www', create: false, field_changes: [], env_var_changes: [], problems: [] })
		expect(writes(requests)).toEqual([])
	})

	it('detects a stale build_command and missing environment variable without writing anything when apply is false', async () => {
		const config = matching_config()
		config.production_settings.build_command = 'pnpm run build'
		config.production_settings.environment_variables = {}
		const requests: Request[] = []

		const [plan] = await reconcile_workers(credentials, { apply: false, apps: [test_app] }, account_fetch({ www: config }, requests))

		expect(plan.field_changes).toEqual([{ field: 'build_command', from: 'pnpm run build', to: build_command }])
		expect(plan.env_var_changes).toEqual([{ field: 'SKIP_DEPENDENCY_INSTALL', from: '(unset)', to: 'true' }])
		expect(writes(requests)).toEqual([])
	})

	it('PATCHes only the drifted production settings when apply is true', async () => {
		const config = matching_config(['*'])
		config.production_settings.environment_variables = { OTHER: { value: 'kept', is_secret: false } }
		const requests: Request[] = []

		const [plan] = await reconcile_workers(credentials, { apply: true, apps: [test_app] }, account_fetch({ www: config }, requests))

		expect(plan.field_changes).toEqual([{ field: 'path_includes', from: ['*'], to: www_watch_paths }])
		expect(writes(requests)).toEqual([{
			method: 'PATCH',
			url: 'https://api.cloudflare.com/client/v4/accounts/account-1/builds/workers/tag-www',
			body: { production_settings: { path_includes: www_watch_paths, environment_variables: { SKIP_DEPENDENCY_INSTALL: { value: 'true', is_secret: false } } } },
		}])
	})

	it('reports Workers Builds preview builds being on, without trying to change them', async () => {
		const config = { ...matching_config(), previews_enabled: true }
		const requests: Request[] = []

		const [plan] = await reconcile_workers(credentials, { apply: true, apps: [test_app] }, account_fetch({ www: config }, requests))

		expect(plan.problems).toEqual([expect.stringMatching(/preview builds are on/)])
		expect(writes(requests)).toEqual([])
	})

	it('reports a Worker that has never been deployed, and still reconciles the others', async () => {
		const [missing, template] = await reconcile_workers(credentials, { apply: true, apps: [test_app, template_app] }, account_fetch({ sources: matching_config() }))

		expect(missing.problems).toEqual([expect.stringMatching(/No Worker named "www" exists yet/)])
		expect(template.problems).toEqual([])
	})

	it('connects an unconnected Worker, copying the git repository and build token from a connected one', async () => {
		const requests: Request[] = []

		const [plan] = await reconcile_workers(credentials, { apply: true, apps: [test_app, template_app] }, account_fetch({ www: null, sources: matching_config() }, requests))

		expect(plan).toEqual({ worker_name: 'www', create: true, field_changes: [], env_var_changes: [], problems: [] })
		const settings = {
			build_command,
			deploy_command: production_deploy_command,
			build_caching_enabled: true,
			path_includes: www_watch_paths,
			root_directory: '/apps/www',
			build_token_uuid: 'build-token-1',
			environment_variables: { SKIP_DEPENDENCY_INSTALL: { value: 'true', is_secret: false } },
		}
		// The template's fixture reuses www's watch paths, so sources also gets a PATCH; only the POST matters here
		expect(requests.filter(request => request.method === 'POST')).toEqual([{
			method: 'POST',
			url: 'https://api.cloudflare.com/client/v4/accounts/account-1/builds/workers',
			body: {
				script_tag: 'tag-www',
				git_repository: { provider_type: 'github', provider_account_id: '336682665', provider_account_name: 'CanIL-CA', repo_id: '680338472', repo_name: 'tabitha', branch: 'main' },
				production_settings: settings,
				previews_base_config: { ...settings, deploy_command: preview_deploy_command },
				previews_enabled: false,
			},
		}])
	})

	it('plans the connection without writing when apply is false', async () => {
		const requests: Request[] = []

		const [plan] = await reconcile_workers(credentials, { apply: false, apps: [test_app, template_app] }, account_fetch({ www: null, sources: matching_config() }, requests))

		expect(plan.create).toBe(true)
		expect(writes(requests)).toEqual([])
	})

	it('throws if no Worker is connected to copy the git repository and build token from', async () => {
		await expect(reconcile_workers(credentials, { apply: false, apps: [test_app] }, account_fetch({ www: null }))).rejects.toThrow(/no other Worker is connected/)
	})
})
