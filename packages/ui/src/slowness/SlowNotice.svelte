<script lang="ts">
	import { navigating } from '$app/state'
	import { use_request_tracking } from '@tabitha/api-client'
	import { onMount } from 'svelte'
	import { get_ui_messages } from '../i18n/ui_messages'
	import Toast from '../Toast.svelte'
	import { pending_requests, track_pending } from './pending.svelte'
	import { wait_severity } from './wait_severity'

	const messages = get_ui_messages()

	// In the browser only: on the server, the clients' requests belong to other users' page loads.
	onMount(() => use_request_tracking(track_pending))

	let now = $state(Date.now())
	let dismissed_key = $state<string>()

	// Re-evaluated only when a navigation starts or ends, so this holds its start time.
	const navigation_started_at = $derived(navigating.to ? Date.now() : undefined)

	const waiting_since = $derived(Math.min(navigation_started_at ?? Infinity, pending_requests.oldest ?? Infinity))
	const is_waiting = $derived(waiting_since !== Infinity)

	// Ticks only while something is in flight, so an idle tab does no work.
	$effect(() => {
		if (!is_waiting) return

		now = Date.now()
		const timer = setInterval(() => now = Date.now(), 1_000)
		return () => clearInterval(timer)
	})

	const severity = $derived(is_waiting ? wait_severity(now - waiting_since) : 'none')

	// Dismissing hides this severity of this wait only, so a slow wait that goes on to stall still says so.
	const notice_key = $derived(`${waiting_since}:${severity}`)
	const is_shown = $derived(severity !== 'none' && notice_key !== dismissed_key)

	function dismiss() {
		dismissed_key = notice_key
	}
</script>

<!-- Tells people when a wait is our problem, so a stall never reads as "it just does that sometimes". -->
<div role="status" aria-live="polite">
	{#if is_shown && severity === 'slow'}
		<Toast variant="info" on_dismiss={dismiss}>{messages.ui_slow()}</Toast>
	{:else if is_shown && severity === 'stalled'}
		<Toast variant="error" on_dismiss={dismiss}>{messages.ui_stalled()}</Toast>
	{/if}
</div>
