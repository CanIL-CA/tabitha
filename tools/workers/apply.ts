import { join } from 'node:path'
import {
	build_command,
	desired_apps,
	managed_environment_variables,
	preview_deploy_command,
	production_deploy_command,
	type DesiredApp,
} from './config'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const REPO_ROOT = join(import.meta.dir, '..', '..')

/** Cloudflare's error code for a Worker that exists but isn't connected to a repo yet. */
const NO_BUILD_CONFIGURATION_ERROR = 12040

/** Workspace packages whose changes don't affect an app's built output, so they're left out of
 * the production watch paths even though the app genuinely depends on them. */
const build_irrelevant_packages = new Set(['@tabitha/eslint-config', '@tabitha/tsconfig'])

export type CloudflareCredentials = {
	account_id: string
	api_token: string
}

type EnvironmentVariables = Record<string, { value: string; is_secret: boolean }>

/** A Worker's Workers Builds settings on Cloudflare's Worker Previews build model, trimmed to the
 * fields this tool reads or writes. Every Worker is on that model: production builds from `main`
 * use `production_settings`, and PR previews are built by CI instead
 * (docs/decisions/0020-per-pr-worker-previews.md). The older model's per-branch triggers, whose
 * settings the dashboard silently left stale, are described in the "Workers Builds Git
 * Integration" section of the `cloudflare-workers` skill. */
type WorkerBuildConfig = {
	git_repository: {
		provider_type: string
		provider_account_id: string
		provider_account_name: string
		repo_id: string
		repo_name: string
		branch: string
	}
	production_settings: {
		build_command: string
		deploy_command: string
		build_caching_enabled: boolean
		path_includes: string[]
		build_token_uuid: string
		environment_variables: EnvironmentVariables
	}
	previews_enabled: boolean
}

type DesiredSettings = {
	build_command: string
	deploy_command: string
	build_caching_enabled: boolean
	path_includes: string[]
}

export type FieldChange = { field: string; from: unknown; to: unknown }

export type AppPlan = {
	worker_name: string
	/** True when the Worker isn't connected to the repo yet, so `apply` creates its build settings. */
	create: boolean
	field_changes: FieldChange[]
	env_var_changes: FieldChange[]
	/** Drift this tool reports but doesn't fix -- fix it by hand. */
	problems: string[]
}

/** Computes (and, if `apply` is true, performs) the changes needed to bring every app's Workers
 * Builds production settings in line with `config.ts`. A Worker that exists but isn't connected
 * to the repo yet gets connected, with the git repository and build token copied from an
 * already-connected Worker. Never touches `branch`, `path_excludes`, `root_directory` (except
 * when connecting), the Previews settings, or any environment variable this tool doesn't itself
 * declare in `managed_environment_variables` -- anything else already set, by hand or by
 * something else, is left alone. */
export async function reconcile_workers({ credentials, apply, apps = desired_apps, fetch_impl = fetch }: {
	credentials: CloudflareCredentials
	apply: boolean
	apps?: DesiredApp[]
	fetch_impl?: typeof fetch
}): Promise<AppPlan[]> {
	const worker_tags = await get_worker_tags({ credentials, fetch_impl })

	const current_configs = new Map<string, WorkerBuildConfig | null>()
	for (const app of apps) {
		const tag = worker_tags.get(app.worker_name)
		if (tag) current_configs.set(app.worker_name, await get_build_config({ credentials, worker_tag: tag, fetch_impl }))
	}
	const template = [...current_configs.values()].find(config => config !== null)

	const plans: AppPlan[] = []
	for (const app of apps) {
		const tag = worker_tags.get(app.worker_name)
		if (!tag) {
			plans.push({
				worker_name: app.worker_name,
				create: false,
				field_changes: [],
				env_var_changes: [],
				problems: [`No Worker named "${app.worker_name}" exists yet; run its first \`bunx wrangler deploy\` from apps/${app.app_dir}, then re-run this tool`],
			})
			continue
		}

		const desired: DesiredSettings = {
			build_command,
			deploy_command: production_deploy_command,
			build_caching_enabled: true,
			path_includes: await derive_watch_paths(app.app_dir),
		}

		const current = current_configs.get(app.worker_name)
		if (!current) {
			if (!template) throw new Error(`Can't connect "${app.worker_name}": no other Worker is connected to the repo to copy its git repository and build token from.`)
			if (apply) await create_build_config({ credentials, worker_tag: tag, app, desired, template, fetch_impl })
			plans.push({ worker_name: app.worker_name, create: true, field_changes: [], env_var_changes: [], problems: [] })
			continue
		}

		const changes = await reconcile_production_settings({ credentials, worker_tag: tag, current, desired, apply, fetch_impl })
		plans.push({
			worker_name: app.worker_name,
			create: false,
			...changes,
			problems: current.previews_enabled
				? ['Workers Builds preview builds are on; CI builds PR previews, so turn off "Builds for Preview branches" in Settings -> Builds']
				: [],
		})
	}

	return plans
}

async function reconcile_production_settings({ credentials, worker_tag, current, desired, apply, fetch_impl }: {
	credentials: CloudflareCredentials
	worker_tag: string
	current: WorkerBuildConfig
	desired: DesiredSettings
	apply: boolean
	fetch_impl: typeof fetch
}): Promise<{ field_changes: FieldChange[]; env_var_changes: FieldChange[] }> {
	const settings = current.production_settings
	const field_changes: FieldChange[] = []
	const patch: Record<string, unknown> = {}

	if (settings.build_command !== desired.build_command) field_changes.push({ field: 'build_command', from: settings.build_command, to: desired.build_command })
	// Cloudflare's dashboard has been observed leaving stray leading/trailing whitespace on this
	// field from manual edits -- trim before comparing so that alone doesn't register as drift.
	if (settings.deploy_command.trim() !== desired.deploy_command) field_changes.push({ field: 'deploy_command', from: settings.deploy_command, to: desired.deploy_command })
	if (settings.build_caching_enabled !== desired.build_caching_enabled) {
		field_changes.push({ field: 'build_caching_enabled', from: settings.build_caching_enabled, to: desired.build_caching_enabled })
	}
	if (!same_string_set({ a: settings.path_includes, b: desired.path_includes })) {
		field_changes.push({ field: 'path_includes', from: settings.path_includes, to: desired.path_includes })
	}
	for (const change of field_changes) patch[change.field] = change.to

	const env_var_changes: FieldChange[] = []
	const env_vars_to_set: EnvironmentVariables = {}
	for (const [key, desired_value] of Object.entries(managed_environment_variables)) {
		const current_value = settings.environment_variables[key]?.value
		if (current_value !== desired_value) {
			env_var_changes.push({ field: key, from: current_value ?? '(unset)', to: desired_value })
			env_vars_to_set[key] = { value: desired_value, is_secret: false }
		}
	}
	// The API merges environment variables by key, so variables not listed here are left as they are.
	if (env_var_changes.length > 0) patch.environment_variables = env_vars_to_set

	if (apply && Object.keys(patch).length > 0) {
		await cloudflare_request({ credentials, method: 'PATCH', path: `/builds/workers/${worker_tag}`, body: { production_settings: patch }, fetch_impl })
	}

	return { field_changes, env_var_changes }
}

async function create_build_config({ credentials, worker_tag, app, desired, template, fetch_impl }: {
	credentials: CloudflareCredentials
	worker_tag: string
	app: DesiredApp
	desired: DesiredSettings
	template: WorkerBuildConfig
	fetch_impl: typeof fetch
}): Promise<void> {
	const { provider_type, provider_account_id, provider_account_name, repo_id, repo_name, branch } = template.git_repository
	const settings = {
		...desired,
		root_directory: `/apps/${app.app_dir}`,
		build_token_uuid: template.production_settings.build_token_uuid,
		environment_variables: Object.fromEntries(Object.entries(managed_environment_variables).map(([key, value]) => [key, { value, is_secret: false }])),
	}

	await cloudflare_request({
		credentials,
		method: 'POST',
		path: '/builds/workers',
		body: {
			script_tag: worker_tag,
			git_repository: { provider_type, provider_account_id, provider_account_name, repo_id, repo_name, branch },
			production_settings: settings,
			previews_base_config: { ...settings, deploy_command: preview_deploy_command },
			previews_enabled: false,
		},
		fetch_impl,
	})
}

/** Derives the production watch paths from the app's own `package.json`, rather than
 * hand-maintaining a list per app: every declared workspace dependency (excluding
 * `build_irrelevant_packages`) becomes a `packages/<name>/*` entry, so a newly added dependency
 * is picked up automatically on the next `apply` run instead of silently going unwatched. */
async function derive_watch_paths(app_dir: string): Promise<string[]> {
	const pkg = (await Bun.file(join(REPO_ROOT, 'apps', app_dir, 'package.json')).json()) as {
		dependencies?: Record<string, string>
		devDependencies?: Record<string, string>
	}
	const all_deps = { ...pkg.dependencies, ...pkg.devDependencies }
	const workspace_packages = Object.entries(all_deps)
		.filter(([name, version]) => version.startsWith('workspace:') && !build_irrelevant_packages.has(name))
		.map(([name]) => name.replace('@tabitha/', ''))
		.sort()

	return [`apps/${app_dir}/*`, ...workspace_packages.map(pkg_dir => `packages/${pkg_dir}/*`), 'package.json', 'bun.lock']
}

function same_string_set({ a, b }: {
	a: string[]
	b: string[]
}): boolean {
	if (a.length !== b.length) return false
	const sorted_a = [...a].sort()
	const sorted_b = [...b].sort()
	return sorted_a.every((value, index) => value === sorted_b[index])
}

/** Maps each Worker's name to its tag, Cloudflare's stable per-Worker identifier that the
 * Workers Builds API is keyed by. */
async function get_worker_tags({ credentials, fetch_impl }: {
	credentials: CloudflareCredentials
	fetch_impl: typeof fetch
}): Promise<Map<string, string>> {
	const scripts = (await cloudflare_request({ credentials, method: 'GET', path: '/workers/scripts', fetch_impl })) as { id: string; tag: string }[]
	return new Map(scripts.map(script => [script.id, script.tag]))
}

/** Returns `null` for a Worker that isn't connected to the repo yet. */
async function get_build_config({ credentials, worker_tag, fetch_impl }: {
	credentials: CloudflareCredentials
	worker_tag: string
	fetch_impl: typeof fetch
}): Promise<WorkerBuildConfig | null> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/accounts/${credentials.account_id}/builds/workers/${worker_tag}`, {
		headers: auth_headers(credentials.api_token),
	})
	const body = (await response.json()) as { result: WorkerBuildConfig | null; errors?: { code: number }[] }
	if (response.status === 404 && body.errors?.some(error => error.code === NO_BUILD_CONFIGURATION_ERROR)) return null
	if (!response.ok) throw new Error(`Failed to fetch build settings for worker tag "${worker_tag}": ${response.status} ${JSON.stringify(body)}`)
	return body.result
}

async function cloudflare_request({ credentials, method, path, body, fetch_impl }: {
	credentials: CloudflareCredentials
	method: 'GET' | 'PATCH' | 'POST'
	path: string
	body?: unknown
	fetch_impl: typeof fetch
}): Promise<unknown> {
	const response = await fetch_impl(`${CLOUDFLARE_API_BASE}/accounts/${credentials.account_id}${path}`, {
		method,
		headers: auth_headers(credentials.api_token),
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`)
	return ((await response.json()) as { result: unknown }).result
}

function auth_headers(api_token: string): HeadersInit {
	return {
		'Authorization': `Bearer ${api_token}`,
		'Content-Type': 'application/json',
	}
}

if (import.meta.main) {
	const account_id = require_env('CLOUDFLARE_ACCOUNT_ID')
	const api_token = require_env('CLOUDFLARE_API_TOKEN')
	const apply = process.argv.includes('--run')

	const plans = await reconcile_workers({ credentials: { account_id, api_token }, apply })

	let any_changes = false
	for (const plan of plans) {
		for (const problem of plan.problems) console.log(`${plan.worker_name}: ⚠️ ${problem}`)

		if (plan.create) {
			any_changes = true
			console.log(`${plan.worker_name}: ${apply ? 'connected' : 'would connect'} to the repo, with production builds from main and preview builds off`)
			continue
		}

		const all_changes = [...plan.field_changes, ...plan.env_var_changes]
		if (all_changes.length === 0) {
			if (plan.problems.length === 0) console.log(`${plan.worker_name}: unchanged`)
			continue
		}
		any_changes = true
		const verb = apply ? 'updated' : 'would update'
		console.log(`${plan.worker_name}: ${verb} ${all_changes.map(c => c.field).join(', ')}`)
		for (const change of all_changes) {
			console.log(`  ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`)
		}
	}

	if (!apply && any_changes) console.log('\nRun with --run to apply these changes.')
}

function require_env(key: string): string {
	const value = process.env[key]
	if (!value) throw new Error(`Missing required env var "${key}". Set it in tools/workers/.env.local.`)
	return value
}
