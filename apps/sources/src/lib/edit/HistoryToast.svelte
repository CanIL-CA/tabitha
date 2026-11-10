<script lang="ts">
	import { get_edit_history, type HistoryApplied } from '#lib/edit/history.svelte.js'
	import { Toast } from '@tabitha/ui'

	const TOAST_DURATION_MS = 5000
	const VERB_BY_KIND = { undo: 'Undid', redo: 'Redid' } as const

	const edit_history = get_edit_history()

	let message = $state<string | null>(null)
	let dismiss_timeout: ReturnType<typeof setTimeout> | undefined

	function dismiss() {
		clearTimeout(dismiss_timeout)
		message = null
	}

	function show({ kind, action, details }: HistoryApplied) {
		clearTimeout(dismiss_timeout)
		message = `${VERB_BY_KIND[kind]} ${action}: ${details}`
		dismiss_timeout = setTimeout(dismiss, TOAST_DURATION_MS)
	}

	$effect(() => {
		const unsubscribe = edit_history().subscribe(show)
		return () => {
			unsubscribe()
			dismiss()
		}
	})
</script>

{#if message}
	<Toast variant="info" on_dismiss={dismiss}>{message}</Toast>
{/if}
