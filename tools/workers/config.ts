/** Desired-state config for each TaBiThA app's Cloudflare Workers Builds trigger settings,
 * reconciled against the live account by `apply.ts`. This only covers settings the Workers
 * Builds API can express -- compatibility flags and placement mode are controlled by each app's
 * `wrangler.jsonc` instead (applied authoritatively on every deploy) and are deliberately out of
 * scope here; see this tool's README.
 */

export type DesiredApp = {
	/** Matches the `name` in the app's `wrangler.jsonc`. */
	worker_name: string
	/** The app's directory name under `apps/`, e.g. `'copilot'` for `apps/copilot`. Also used to
	 * derive the production trigger's watch paths from the app's own `package.json`. */
	app_dir: string
	/** Cloudflare's stable per-Worker identifier, distinct from `worker_name`, used to look up a
	 * Worker's Workers Builds triggers. Not a secret -- just an identifier, like
	 * `CLOUDFLARE_ZONE_ID` in `tools/dns`'s `.env` -- but there's no way to derive it from
	 * `worker_name` alone: it only appears in the `tag` field of `GET
	 * /accounts/{account_id}/workers/scripts`, an endpoint this tool's minimally-scoped token
	 * (Workers Builds Configuration only) can't call itself. Captured here once instead; re-fetch
	 * it by hand (with a broader, temporary token) if a Worker is ever deleted and recreated. */
	worker_tag: string
}

export const desired_apps: DesiredApp[] = [
	{ worker_name: 'copilot', app_dir: 'copilot', worker_tag: '438365b3332d4db0b483dc21ffbb1dc0' },
	{ worker_name: 'editor', app_dir: 'editor', worker_tag: '0e95fe00cde241ba89614300f6129cd6' },
	{ worker_name: 'ontology', app_dir: 'ontology', worker_tag: '5722ffa9151e4b2799dd0adb6595b802' },
	{ worker_name: 'scheduler', app_dir: 'scheduler', worker_tag: '17ef176bd6f7473c9e3143ab9fe110c4' },
	{ worker_name: 'sources', app_dir: 'sources', worker_tag: '77332af7a6f84b52bede77cdc4c3a1ea' },
	{ worker_name: 'targets', app_dir: 'targets', worker_tag: 'ae35e59e43814365a758068b590d986c' },
	{ worker_name: 'www', app_dir: 'www', worker_tag: 'f0cbbb74c7464674ac9e5871be861ae5' },
]

/** The production trigger installs its own deps and builds itself. Cloudflare's automatic
 * dependency-install step doesn't reliably detect Bun's text-based `bun.lock` and silently falls
 * back to `npm install`, which fails on a Bun-only workspace; making the build command self-sufficient sidesteps that regardless of whether
 * Cloudflare's detection ever improves. */
export const build_command = 'bun install && bun run build'

export const production_deploy_command = 'bunx wrangler deploy'

/** Skips Cloudflare's own automatic dependency-install step, since `build_command` above already
 * runs `bun install` itself -- see the note on `build_command`. Only keys listed here are ever compared or written, so any other Build Variable
 * already set on a trigger (by hand or otherwise) is left untouched. */
export const managed_environment_variables: Record<string, string> = {
	SKIP_DEPENDENCY_INSTALL: 'true',
}
