<script lang="ts">
	import { usage_info } from '#lib/lookups.js'
	import type { PartOfSpeech } from '@tabitha/types'

	type Props = {
		part_of_speech: PartOfSpeech
		categories?: string[]
		offset?: number
	}

	let { part_of_speech, categories = $bindable([]), offset = 0 }: Props = $props()

	let usages = $derived(usage_info[part_of_speech] || [])

	// note: tailwind only generates classes it can find as literal text, so the full string needs to be kept
	const choices = [
		{
			label: 'Always',
			to_value: (usage: string) => `always ${usage}`,
			checked_color: 'checked:[--btn-color:var(--color-success)] checked:[--btn-fg:var(--color-success-content)]',
		},
		{
			label: 'Sometimes',
			to_value: (usage: string) => `sometimes ${usage}`,
			checked_color: 'checked:[--btn-color:var(--color-info)] checked:[--btn-fg:var(--color-info-content)]',
		},
		{
			label: 'Never',
			to_value: (usage: string) => `never ${usage}`,
			checked_color: 'checked:[--btn-color:var(--color-neutral)] checked:[--btn-fg:var(--color-neutral-content)]',
		},
	]
</script>

<fieldset class="fieldset border border-base-300 rounded-box p-4">
	<legend class="fieldset-legend font-semibold">Usage Info</legend>

	<div class="grid grid-cols-[auto_auto] justify-start gap-x-4 divide-y divide-base-300">
		{#each usages as usage, i}
			{@const slot = i + offset}
			<div class="col-span-2 grid grid-cols-subgrid items-center py-1">
				<div role="radiogroup" aria-labelledby="usage-info-{slot}" class="join">
					{#each choices as { label, to_value, checked_color }}
						<input
							type="radio"
							name="usage-info-{slot}"
							value={to_value(usage)}
							bind:group={categories[slot]}
							aria-label={label}
							class="join-item btn btn-sm {checked_color}"
						/>
					{/each}
				</div>
				<span id="usage-info-{slot}" class="text-sm">{usage}</span>
			</div>
		{/each}
	</div>
</fieldset>
