/** Desired-state config for the TaBiThA account's Cloudflare notification policies and the Workers
 * Issues automations that send issues to them, reconciled against the live account by `apply.ts`.
 * A `name` is each one's identity: `apply.ts` only ever touches a live policy or automation whose
 * name matches one declared here, so renaming one here creates a new one and leaves the old one
 * behind to delete by hand.
 */

/** Recipients aren't declared here: this repo is public, so they're kept out of it. `apply.ts` seeds
 * a new policy's recipients from `ALERT_EMAILS` in `.env.local` and never changes them afterwards;
 * they're managed on the policy's page in the dashboard (see the README). */
export type DesiredPolicy = {
	name: string
	description: string
	/** A type from `GET /accounts/{account_id}/alerting/v3/available_alerts`. */
	alert_type: string
}

/** Fires once an issue reaches a number of occurrences, or when an issue recurs after a quiet spell.
 * One automation holds one trigger, so both behaviors need an automation each. */
export type AutomationTrigger =
	| { after_occurrences: number }
	| { after_inactivity_seconds: number }

/** Account-wide: covers every Worker, including ones added later. */
export type DesiredAutomation = {
	name: string
	/** The `name` of a policy in `desired_policies`, which the automation sends issues to. */
	policy_name: string
	trigger: AutomationTrigger
}

const WORKER_ISSUES_POLICY = 'Worker issues (tools/alerts)'

export const desired_policies: DesiredPolicy[] = [
	{
		name: WORKER_ISSUES_POLICY,
		description: "Emails when Workers Issues detects a new failure on any TaBiThA Worker or cron. Needs observability.issues.enabled in each app's wrangler.jsonc.",
		// Not offered in the dashboard's notification picker, so this policy can only be made via the API.
		alert_type: 'workers_observability_real_time_issue',
	},
]

// A Real-Time Issue policy sends nothing on its own: only an automation pointing at it does.
export const desired_automations: DesiredAutomation[] = [
	{
		name: 'New Worker issue (tools/alerts)',
		policy_name: WORKER_ISSUES_POLICY,
		trigger: { after_occurrences: 1 },
	},
]
