<script lang="ts">
	import Icon from '@iconify/svelte'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { Toast } from '@tabitha/ui'

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()

	function undo() {
		const action = edit_history().undo()
		selected_entity.select_ids({ ids: action?.ids ?? [] })
		if (action) show_history_toast(`Undid ${action.action}: ${action.details}`)
	}

	function redo() {
		const action = edit_history().redo()
		selected_entity.select_ids({ ids: action?.ids ?? [] })
		if (action) show_history_toast(`Redid ${action.action}: ${action.details}`)
	}

	let history_toast = $state<string | null>(null)
	let history_toast_timeout: ReturnType<typeof setTimeout> | undefined
	
	function dismiss_history_toast() {
		clearTimeout(history_toast_timeout)
		history_toast = null
	}

	function show_history_toast(message: string) {
		clearTimeout(history_toast_timeout)
		history_toast = message
		history_toast_timeout = setTimeout(dismiss_history_toast, 5000)
	}

	const HISTORY_SHORTCUTS: Record<string, () => void> = {
		'z': undo,
		'shift+z': redo,
		'y': redo,
	}

	function handle_history_shortcut(event: KeyboardEvent) {
		if (!event.ctrlKey && !event.metaKey) return
		// leave the browser's native text undo alone inside text fields
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

		const shortcut = `${event.shiftKey ? 'shift+' : ''}${event.key.toLowerCase()}`
		const action = HISTORY_SHORTCUTS[shortcut]
		if (!action) return

		event.preventDefault()
		action()
	}
</script>

<svelte:window onkeydown={handle_history_shortcut} />

<div class="join">
	<button
		onclick={undo}
		disabled={!edit_history().can_undo}
		aria-label="Undo"
		title="Undo (Ctrl+Z)"
		class="btn btn-sm join-item"
	>
		<Icon icon="mdi:undo" class="h-4 w-4" />
	</button>
	<button
		onclick={redo}
		disabled={!edit_history().can_redo}
		aria-label="Redo"
		title="Redo (Ctrl+Shift+Z)"
		class="btn btn-sm join-item"
	>
		<Icon icon="mdi:redo" class="h-4 w-4" />
	</button>
</div>

{#if history_toast}
	<Toast variant="info" on_dismiss={dismiss_history_toast}>{history_toast}</Toast>
{/if}