<script lang="ts">
	import Icon from '@iconify/svelte'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { encode_source_entities } from '#lib/encoding/semantic_encoding.js'

	const edit_history = get_edit_history()

	let dialog: HTMLDialogElement
	let encoded_text = $state('')
	let is_copied = $state(false)

	function open_dialog() {
		encoded_text = encode_source_entities(edit_history().current.source_entities)
		is_copied = false
		dialog.showModal()
	}

	async function copy_encoded_text() {
		await navigator.clipboard.writeText(encoded_text)
		is_copied = true
	}
</script>

<button
	type="button"
	onclick={open_dialog}
	aria-label="Show encoded text"
	title="Show encoded text"
	class="btn btn-sm btn-square"
>
	<Icon icon="mdi:download" class="h-4 w-4" />
</button>

<!-- https://daisyui.com/components/modal -->
<dialog bind:this={dialog} class="modal">
	<section class="modal-box w-11/12 max-w-3xl">
		<form method="dialog">
			<button aria-label="Close" class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2">
				<Icon icon="material-symbols:close" class="h-4 w-4" />
			</button>
		</form>

		<h3 class="font-bold text-lg">Encoded text</h3>

		<textarea
			readonly
			value={encoded_text}
			aria-label="Encoded text"
			class="textarea textarea-bordered w-full h-64 mt-4 font-mono text-xs"
		></textarea>

		<div class="modal-action">
			<button type="button" onclick={copy_encoded_text} class="btn btn-primary">
				<Icon icon={is_copied ? 'mdi:check-bold' : 'mdi:content-copy'} class="h-4 w-4" />
				{is_copied ? 'Copied' : 'Copy'}
			</button>
			<form method="dialog">
				<button class="btn btn-secondary">Close</button>
			</form>
		</div>
	</section>

	<form method="dialog" class="modal-backdrop">
		<button>Close</button>
	</form>
</dialog>
