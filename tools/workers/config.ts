/** Desired-state config for each TaBiThA app's Cloudflare Workers Builds production settings,
 * reconciled against the live account by `apply.ts`. This only covers settings the Workers
 * Builds API can express -- compatibility flags and placement mode are controlled by each app's
 * `wrangler.jsonc` instead (applied authoritatively on every deploy) and are deliberately out of
 * scope here; see this tool's README.
 */

export type DesiredApp = {
	/** Matches the `name` in the app's `wrangler.jsonc`. */
	worker_name: string
	/** The app's directory name under `apps/`, e.g. `'copilot'` for `apps/copilot`. Used to derive
	 * the production watch paths from the app's own `package.json`, and as the root directory when
	 * `apply.ts` connects a new Worker to the repo. */
	app_dir: string
}

export const desired_apps: DesiredApp[] = [
	{ worker_name: 'copilot', app_dir: 'copilot' },
	{ worker_name: 'editor', app_dir: 'editor' },
	{ worker_name: 'ontology', app_dir: 'ontology' },
	{ worker_name: 'scheduler', app_dir: 'scheduler' },
	{ worker_name: 'sources', app_dir: 'sources' },
	{ worker_name: 'targets', app_dir: 'targets' },
	{ worker_name: 'www', app_dir: 'www' },
]

/** The production trigger installs its own deps and builds itself. Cloudflare's automatic
 * dependency-install step doesn't reliably detect Bun's text-based `bun.lock` and silently falls
 * back to `npm install`, which fails on a Bun-only workspace; making the build command self-sufficient sidesteps that regardless of whether
 * Cloudflare's detection ever improves. */
export const build_command = 'bun install && bun run build'

export const production_deploy_command = 'bunx wrangler deploy'

/** Only used when `apply.ts` connects a new Worker: Cloudflare requires a Previews base config even
 * with preview builds off, since CI builds PR previews instead (docs/decisions/0020-per-pr-worker-previews.md). */
export const preview_deploy_command = 'bunx wrangler preview'

/** Skips Cloudflare's own automatic dependency-install step, since `build_command` above already
 * runs `bun install` itself -- see the note on `build_command`. Only keys listed here are ever compared or written, so any other Build Variable
 * already set on a trigger (by hand or otherwise) is left untouched. */
export const managed_environment_variables: Record<string, string> = {
	SKIP_DEPENDENCY_INSTALL: 'true',
}
