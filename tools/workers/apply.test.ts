import { describe, expect, it, mock } from 'bun:test'
import { reconcile_workers } from './apply'
import { build_command, production_deploy_command } from './config'

const credentials = { account_id: 'account-1', api_token: 'token-1' }

// Reuses apps/www as the fixture app -- derive_watch_paths reads a real package.json off disk,
// and www's dependency list is the smallest of the 6 real apps.
const test_app = { worker_name: 'www', app_dir: 'www', worker_tag: 'tag-www' }
const www_watch_paths = ['apps/www/*', 'packages/api-client/*', 'packages/types/*', 'packages/ui/*', 'packages/vite-config/*', 'package.json', 'bun.lock']

const matching_production_trigger = {
	trigger_uuid: 'trigger-prod',
	build_command,
	deploy_command: production_deploy_command,
	branch_includes: ['main'],
	path_includes: www_watch_paths,
	build_caching_enabled: true,
}

// The older build model's second trigger, which a Worker loses when it switches to Worker Previews
const legacy_non_production_trigger = {
	trigger_uuid: 'trigger-preview',
	build_command,
	deploy_command: 'bunx wrangler versions upload',
	branch_includes: ['*'],
	path_includes: www_watch_paths,
	build_caching_enabled: true,
}

function router_fetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
	return mock(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch
}

function json_response(result: unknown) {
	return new Response(JSON.stringify({ result }), { status: 200 })
}

type Overrides = {
	triggers?: unknown[]
	env_vars?: Record<string, { value: string; is_secret: boolean }>
	previews_enabled?: boolean
	patched_bodies?: unknown[]
}

function account_fetch({
	triggers = [matching_production_trigger],
	env_vars = { SKIP_DEPENDENCY_INSTALL: { value: 'true', is_secret: false } },
	previews_enabled = false,
	patched_bodies,
}: Overrides = {}): typeof fetch {
	return router_fetch((url, init) => {
		const method = init?.method ?? 'GET'
		if (url.endsWith('/builds/workers/tag-www') && method === 'GET') return json_response({ previews_enabled })
		if (url.endsWith('/triggers') && method === 'GET') return json_response(triggers)
		if (url.endsWith('/environment_variables') && method === 'GET') return json_response(env_vars)
		if (method === 'PATCH' && patched_bodies) {
			patched_bodies.push(JSON.parse(String(init?.body)))
			return json_response({})
		}
		throw new Error(`Unexpected request: ${method} ${url}`)
	})
}

describe('reconcile_workers', () => {
	it('reports the production trigger unchanged and no problems when everything already matches', async () => {
		const [plan] = await reconcile_workers(credentials, { apply: false, apps: [test_app] }, account_fetch())

		expect(plan.production.field_changes).toEqual([])
		expect(plan.production.env_var_changes).toEqual([])
		expect(plan.problems).toEqual([])
	})

	it('detects a stale build_command and missing environment variable without writing anything when apply is false', async () => {
		const patched_bodies: unknown[] = []
		const fetch_impl = account_fetch({
			triggers: [{ ...matching_production_trigger, build_command: 'pnpm run build' }],
			env_vars: {},
			patched_bodies,
		})

		const [plan] = await reconcile_workers(credentials, { apply: false, apps: [test_app] }, fetch_impl)

		expect(plan.production.field_changes).toEqual([{ field: 'build_command', from: 'pnpm run build', to: build_command }])
		expect(plan.production.env_var_changes).toEqual([{ field: 'SKIP_DEPENDENCY_INSTALL', from: '(unset)', to: 'true' }])
		expect(patched_bodies).toEqual([])
	})

	it('PATCHes the drifted fields when apply is true', async () => {
		const patched_bodies: unknown[] = []
		const fetch_impl = account_fetch({
			triggers: [{ ...matching_production_trigger, path_includes: ['*'] }],
			env_vars: {},
			patched_bodies,
		})

		const [plan] = await reconcile_workers(credentials, { apply: true, apps: [test_app] }, fetch_impl)

		expect(plan.production.field_changes).toEqual([{ field: 'path_includes', from: ['*'], to: www_watch_paths }])
		expect(patched_bodies).toContainEqual(expect.objectContaining({ path_includes: www_watch_paths }))
		expect(patched_bodies).toContainEqual({ SKIP_DEPENDENCY_INSTALL: { value: 'true', is_secret: false } })
	})

	it('reports Workers Builds preview builds being on, without trying to change them', async () => {
		const patched_bodies: unknown[] = []
		const fetch_impl = account_fetch({ previews_enabled: true, patched_bodies })

		const [plan] = await reconcile_workers(credentials, { apply: true, apps: [test_app] }, fetch_impl)

		expect(plan.problems).toEqual([expect.stringMatching(/preview builds are on/)])
		expect(patched_bodies).toEqual([])
	})

	it('throws if a worker is still on the older build model, with a non-production trigger', async () => {
		const fetch_impl = account_fetch({ triggers: [matching_production_trigger, legacy_non_production_trigger] })

		await expect(reconcile_workers(credentials, { apply: false, apps: [test_app] }, fetch_impl)).rejects.toThrow(/Expected exactly one \(production\) trigger/)
	})

	it('throws if a worker has no production trigger', async () => {
		const fetch_impl = account_fetch({ triggers: [] })

		await expect(reconcile_workers(credentials, { apply: false, apps: [test_app] }, fetch_impl)).rejects.toThrow(/Expected exactly one \(production\) trigger/)
	})
})
