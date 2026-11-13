<script lang="ts">
	import Icon from '@iconify/svelte'
	import { Header, Settings } from '#lib/index.js'
	import Navigation from '#lib/Navigation.svelte'
	import EncodedTextButton from '#lib/edit/EncodedTextButton.svelte'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { get_ontology_senses } from '#lib/data/ontology_senses_context.svelte.js'
	import type { Phase1 } from '#lib/edit/phase1.svelte.js'
	import type { NavData } from '#lib/types.js'

	type Props = {
		nav_data: NavData
		phase1: Phase1 | null
	}
	let { nav_data, phase1 }: Props = $props()

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()
	const senses = get_ontology_senses()

	async function analyze_text() {
		if (!phase1) return

		if (edit_history().current.source_entities.length) {
			if (!confirm('Are you sure you want to re-analyze this verse? The current encoding will get wiped out.')) {
				return
			}
		}

		const analyze_result = await phase1.analyze()

		if (analyze_result.status === 'error') {
			return
		}
		
		senses.remember(analyze_result.ontology_results)
		edit_history().record({ action: 'analyze', ids_before: [] })
		edit_history().current = { source_entities: analyze_result.source_entities }
	}
	
	function undo() {
		const action = edit_history().undo()
		if (action?.action === 'analyze') {
			phase1?.clear_analyze_result()
		}
		selected_entity.select_ids({ ids: action?.ids ?? [] })
	}

	function redo() {
		const action = edit_history().redo()
		selected_entity.select_ids({ ids: action?.ids ?? [] })
	}

	function save() {
		// TODO
	}

	function generate() {
		// TODO
	}

	const KEYBOARD_SHORTCUTS: Record<string, () => void> = {
		's': save,
		'g': generate,
		'z': undo,
		'shift+z': redo,
		'y': redo,
	}

	function handle_keyboard_shortcuts(event: KeyboardEvent) {
		if (!event.ctrlKey && !event.metaKey) return
		// leave the browser's native text undo alone inside text fields
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return

		const shortcut = `${event.shiftKey ? 'shift+' : ''}${event.key.toLowerCase()}`
		const action = KEYBOARD_SHORTCUTS[shortcut]
		if (!action) return

		event.preventDefault()
		action()
	}
</script>

<svelte:window onkeydown={handle_keyboard_shortcuts} />

<div class="sticky top-0 z-15 bg-base-100">
	<Header>
		<div class="flex flex-wrap gap-4 ml-4">
			<Navigation {nav_data} url_end="/edit" size="sm" />

			{#if phase1}
				<button
					type="submit"
					onclick={analyze_text}
					disabled={phase1.analyzing}
					class="btn btn-sm btn-primary min-w-30"
				>
					Analyze
					{#if phase1.analyzing}
						<Icon icon="line-md:loading-twotone-loop" class="h-5 w-5" />
					{:else}
						<Icon icon="mdi:magnify" class="h-5 w-5" />
					{/if}
				</button>
			{/if}

			<div data-tip="coming soon" class="tooltip">
				<button
					onclick={generate}
					disabled
					title="Generate (Ctrl+G)"
					class="btn btn-sm btn-secondary min-w-30"
				>
					Generate
					<Icon icon="mdi:play-circle-outline" class="h-5 w-5" />
				</button>
			</div>

			<div data-tip="coming soon" class="tooltip">
				<button
					onclick={save}
					disabled
					title="Save (Ctrl+S)"
					class="btn btn-sm btn-primary min-w-30"
				>
					Save
					<Icon icon="mdi:content-save-outline" class="h-5 w-5" />
				</button>
			</div>

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

			<EncodedTextButton />

			<Settings />
		</div>
	</Header>

	<div class="divider my-0 mx-8"></div>
</div>
