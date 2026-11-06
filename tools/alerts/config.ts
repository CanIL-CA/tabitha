/** Desired-state config for the TaBiThA account's Cloudflare notification policies, reconciled
 * against the live account by `apply.ts`. A policy's `name` is its identity: `apply.ts` only ever
 * touches a live policy whose name matches one declared here, so renaming one here creates a new
 * policy and leaves the old one behind to delete by hand.
 */

export type DesiredPolicy = {
	name: string
	description: string
	/** A type from `GET /accounts/{account_id}/alerting/v3/available_alerts`. */
	alert_type: string
	emails: string[]
}

export const desired_policies: DesiredPolicy[] = [
	{
		name: 'Worker issues (tools/alerts)',
		description: "Emails when Workers Issues detects a new or recurring failure on any TaBiThA Worker or cron. Needs observability.issues.enabled in each app's wrangler.jsonc.",
		// Not offered in the dashboard's notification picker, so this policy can only be made via the API.
		alert_type: 'workers_observability_real_time_issue',
		emails: ['billy.clark@canil.ca'],
	},
]
