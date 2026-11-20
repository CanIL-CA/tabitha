<script lang="ts">
	import type { Reference } from '@tabitha/types'
	import Icon from '@iconify/svelte'
	import { onMount, untrack } from 'svelte'
	import {
		fetch_types,
		fetch_primary_ids,
		group_primary_ids,
		fetch_secondary_ids,
		fetch_tertiary_ids,
	} from '#lib/data/reference_options.js'

	type Props = {
		current: Reference
		create_url: (reference: Reference) => string
		onclose: () => void
	}
	let { current, create_url, onclose }: Props = $props()

	let dialog: HTMLDialogElement
	let selected = $state<Reference>(untrack(() => ({ ...current })))
	let options = $state({
		types: [] as string[],
		primary_ids: [] as string[],
		secondary_ids: [] as string[],
		tertiary_ids: [] as string[],
	})

	let book_groups = $derived(group_primary_ids({ type: selected.type, ids: options.primary_ids }))
	let is_complete =$derived(Object.values(selected).every(id => id !== ''))

	onMount(async () => {
		dialog.showModal()

		const { type, id_primary, id_secondary } = selected
		const [types, primary_ids, secondary_ids, tertiary_ids] = await Promise.all([
			fetch_types(),
			fetch_primary_ids(type),
			fetch_secondary_ids({ type, id_primary }),
			fetch_tertiary_ids({ type, id_primary, id_secondary }),
		])
		options = { types, primary_ids, secondary_ids, tertiary_ids }
	})

	async function select_type(type: string) {
		selected.type = type
		options.primary_ids = await fetch_primary_ids(type)
		await select_primary_id(options.primary_ids[0] ?? '')
	}

	async function select_primary_id(id_primary: string) {
		selected.id_primary = id_primary
		options.secondary_ids = await fetch_secondary_ids({ type: selected.type, id_primary })
		await select_secondary_id(options.secondary_ids[0] ?? '')
	}

	async function select_secondary_id(id_secondary: string) {
		selected.id_secondary = id_secondary
		options.tertiary_ids = await fetch_tertiary_ids({ type: selected.type, id_primary: selected.id_primary, id_secondary })
		selected.id_tertiary = options.tertiary_ids[0] ?? ''
	}
</script>

{#snippet book_options(ids: string[])}
	{#each ids as id_primary}
		<option value={id_primary}>{id_primary}</option>
	{/each}
{/snippet}

<!-- https://daisyui.com/components/modal -->
<dialog bind:this={dialog} {onclose} class="modal">
	<section class="modal-box">
		<form method="dialog">
			<button aria-label="Close" class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2">
				<Icon icon="material-symbols:close" class="h-4 w-4" />
			</button>
		</form>

		<article class="card">
			<main class="card-body">
				<h2 class="card-title">Go to reference</h2>

				<div class="grid grid-cols-2 gap-4">
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Source Text</legend>
						<select bind:value={() => selected.type, select_type} class="select w-full">
							{#each options.types as type}
								<option value={type}>{type}</option>
							{/each}
						</select>
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend">Book</legend>
						<select bind:value={() => selected.id_primary, select_primary_id} class="select w-full">
							{#each book_groups as { label, ids }}
								{#if label}
									<optgroup {label}>
										{@render book_options(ids)}
									</optgroup>
								{:else}
									{@render book_options(ids)}
								{/if}
							{/each}
						</select>
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend">Chapter</legend>
						<select bind:value={() => selected.id_secondary, select_secondary_id} class="select w-full">
							{#each options.secondary_ids as id_secondary}
								<option value={id_secondary}>{id_secondary}</option>
							{/each}
						</select>
					</fieldset>

					<fieldset class="fieldset">
						<legend class="fieldset-legend">Verse</legend>
						<select bind:value={selected.id_tertiary} class="select w-full">
							{#each options.tertiary_ids as id_tertiary}
								<option value={id_tertiary}>{id_tertiary}</option>
							{/each}
						</select>
					</fieldset>
				</div>

				<section class="card-actions mt-4 justify-end">
					<a
						href={create_url(selected)}
						target="_self"
						aria-disabled={!is_complete}
						onclick={() => dialog.close()}
						class="btn btn-primary btn-md"
						class:btn-disabled={!is_complete}
					>
						GO
					</a>
					<form method="dialog">
						<button class="btn btn-secondary btn-md">
							CANCEL
						</button>
					</form>
				</section>
			</main>
		</article>
	</section>

	<form method="dialog" class="modal-backdrop">
		<button>Close</button>
	</form>
</dialog>
