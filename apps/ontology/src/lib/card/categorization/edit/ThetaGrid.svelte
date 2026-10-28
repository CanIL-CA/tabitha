<script lang="ts">
	import { theta_grid_arguments } from '#lib/lookups.js'
	import type { PartOfSpeech } from '@tabitha/types'
	import ThetaGridPreview from '../ThetaGrid.svelte'

	type Props = {
		categories?: string[]
		part_of_speech?: PartOfSpeech
	}

	let { categories = $bindable([]) }: Props = $props()

	// note: tailwind only generates classes it can find as literal text, so the full string needs to be kept
	const choices = [
		{ 
			label: 'Required',
			to_value: (argument: string) => argument,
			checked_color: 'checked:[--btn-color:var(--color-success)] checked:[--btn-fg:var(--color-success-content)]',
		},
		{
			label: 'Optional',
			to_value: (argument: string) => `(${argument})`,
			checked_color: 'checked:[--btn-color:var(--color-info)] checked:[--btn-fg:var(--color-info-content)]',
		},
		{ 
			label: 'Unused',
			to_value: () => '',
			checked_color: 'checked:[--btn-color:var(--color-neutral)] checked:[--btn-fg:var(--color-neutral-content)]',
		},
	]

	let used_categories = $derived(categories.filter(Boolean))
</script>

<fieldset class="fieldset border border-base-300 rounded-box p-4">
	<legend class="fieldset-legend font-semibold">Theta Grid</legend>

	<ThetaGridPreview categories={used_categories} />

	<div class="mt-2 grid grid-cols-[auto_auto] justify-start gap-x-4 divide-y divide-base-300">
		{#each theta_grid_arguments as argument, i}
			<div class="col-span-2 grid grid-cols-subgrid items-center py-1">
				<span id="theta-grid-{i}" class="text-sm">{argument}</span>
				<div role="radiogroup" aria-labelledby="theta-grid-{i}" class="join">
					{#each choices as { label, to_value, checked_color }}
						<input
							type="radio"
							name="theta-grid-{i}"
							value={to_value(argument)}
							bind:group={categories[i]}
							aria-label={label}
							class="join-item btn btn-sm {checked_color}"
						/>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</fieldset>
