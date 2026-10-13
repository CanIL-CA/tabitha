<script lang="ts">
	import { fade } from 'svelte/transition'
	import SourceData from './SourceData.svelte'
	import type { TargetTextResult } from '@tabitha/types'

	type Props = {
		result: TargetTextResult
		selected_filters: Record<string, string>
		search_regex: RegExp
		highlight_terms: Set<string>
		open?: boolean
	}

	let {
		result,
		selected_filters,
		search_regex,
		highlight_terms,
		open = $bindable(),
	}: Props = $props()

	const FADE_CHARACTERISTICS = {
		delay: 100,
		duration: 700,
	}

	let is_open = $derived(Boolean(open))

	let { id_primary, id_secondary, id_tertiary } = $derived(result.reference)
	let selected_aud = $derived(selected_filters['Audience'] ?? 'Any')
	let filtered_audiences = $derived(result.texts.filter(t => selected_aud === 'Any' ? true : t.audience === selected_aud))

	function toggle(e: MouseEvent) {
		e.preventDefault()
		open = !is_open
	}
</script>

<details transition:fade={FADE_CHARACTERISTICS} open={is_open} class="collapse collapse-arrow bg-base-100 overflow-visible">
	<summary onclick={toggle} class="collapse-title border border-base-200 hover:bg-base-200">
		<section class="flex">
			<span class="min-w-1/8 w-1/8 flex-shrink-0 whitespace-nowrap font-semibold">
				{id_primary} {id_secondary}:{id_tertiary}
			</span>

			<aside class="not-prose">
				{#each filtered_audiences as { text, audience }}
					<p class="mb-1">
						<span class="font-semibold">({audience})</span>
						{#each text.split(search_regex) as t, idx}
							{#if idx % 2 === 0}
								{t}
							{:else}
								<span class="font-semibold italic">{t}</span>
							{/if}
						{/each}
					</p>
				{/each}
			</aside>
		</section>
	</summary>

	<section class="collapse-content flex">
		{#if is_open}
			<div class="min-w-1/8 w-1/8"></div>
			<div class="w-7/8">
				<SourceData reference={result.reference} {highlight_terms} />
			</div>
		{/if}
	</section>
</details>
