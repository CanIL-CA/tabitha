<script lang="ts">
	import { fade } from 'svelte/transition'
	import SourceData from './SourceData.svelte'
	import type { PhraseSearchHit } from '#lib/types.js'

	type Props = {
		hit: PhraseSearchHit
		search_regex: RegExp
		highlight_terms: Set<string>
		open?: boolean
	}

	let { hit, search_regex, highlight_terms, open = $bindable() }: Props = $props()

	const FADE_CHARACTERISTICS = {
		delay: 100,
		duration: 700,
	}

	let is_open = $derived(Boolean(open))
	let { id_primary, id_secondary, id_tertiary } = $derived(hit.reference)

	function toggle(e: MouseEvent) {
		e.preventDefault()
		open = !is_open
	}
</script>

<details transition:fade={FADE_CHARACTERISTICS} open={is_open} class="collapse collapse-arrow bg-base-100 overflow-visible">
	<summary onclick={toggle} class="collapse-title border border-base-200 hover:bg-base-200">
		<section class="flex gap-2">
			<span class="min-w-1/8 w-1/8 shrink-0 font-semibold flex flex-col items-start gap-1">
				<span class="whitespace-nowrap">{id_primary} {id_secondary}:{id_tertiary}</span>
				{#if hit.source_label}
					<em class="badge badge-xs badge-info font-normal" title="Verse text shown is from {hit.source_label}">
						{hit.source_label}
					</em>
				{/if}
			</span>

			<aside class="not-prose flex-1">
				<p class="mb-1">
					{#each hit.text.split(search_regex) as fragment, idx}
						{#if idx % 2 === 0}
							{fragment}
						{:else}
							<span class="font-semibold italic">{fragment}</span>
						{/if}
					{/each}
				</p>
			</aside>
		</section>
	</summary>

	<section class="collapse-content flex">
		{#if is_open}
			<div class="min-w-1/8 w-1/8"></div>
			<div class="w-7/8">
				<SourceData reference={hit.reference} {highlight_terms} />
			</div>
		{/if}
	</section>
</details>
