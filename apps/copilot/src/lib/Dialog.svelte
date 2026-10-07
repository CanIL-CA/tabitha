<script lang="ts">
	import { onMount, type Snippet } from 'svelte'
	import Icon from '@iconify/svelte'
	import { m } from '$lib/paraglide/messages'

	type Props = {
		children: Snippet
		heading: string
		onclose: () => void
		fit_content?: boolean
	}

	let { children, heading, onclose, fit_content }: Props = $props()

	let dialog = $state<HTMLDialogElement>()

	onMount(() => dialog?.showModal())

	let w_classes = $derived(fit_content ? '' : 'max-w-none w-3/4')
</script>

<!-- https://daisyui.com/components/modal -->
<dialog bind:this={dialog} onclose={onclose} class="modal">
	<section class="modal-box {w_classes}">
		<form method="dialog">
			<button class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2">
				<Icon icon="material-symbols:close" class="h-4 w-4" />
			</button>
		</form>

		<article class="card">
			<div class="card-body">
				<section class="card-title justify-between">
					{heading}
				</section>

				<section>
					{@render children()}
				</section>
				
				<section class="card-actions justify-end">
					<form method="dialog">
						<button class="btn btn-primary btn-md">{m.ok()}</button>
					</form>
				</section>
			</div>
		</article>
	</section>

	<form method="dialog" class="modal-backdrop">
		<button>{m.close()}</button>
	</form>
</dialog>