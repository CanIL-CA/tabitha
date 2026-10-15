<script lang="ts">
	import type { SurveyEntryPart, SurveyOutput } from '@tabitha/types/survey'
	import type { Side } from './types'

	type Props = {
		side: Side
		output: SurveyOutput
	}

	let { side, output }: Props = $props()

	const PART_CLASSES: Record<NonNullable<SurveyEntryPart['style']>, string> = {
		strong: 'font-semibold',
		quote: 'italic opacity-75',
		code: 'font-mono text-xs opacity-60',
		label: 'text-xs font-semibold uppercase tracking-wide opacity-75',
	}
</script>

<section aria-label="Output {side.toUpperCase()}" class="card card-border border-t-4 bg-base-100 {side === 'a' ? 'border-t-info' : 'border-t-warning'}">
	<div class="card-body gap-4">
		<h3 class="card-title {side === 'a' ? 'text-info' : 'text-warning'}">Output {side.toUpperCase()}</h3>

		{#if 'error' in output}
			<p class="text-error">This output failed: {output.error}</p>
		{:else}
			{#each output.sections as section (section.title)}
				<div>
					<h4 class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">{section.title}</h4>
					{#if section.entries.length}
						<ul class="space-y-2">
							{#each section.entries as entry, entry_index (entry_index)}
								<li class="border-l-2 border-base-300 pl-3">
									{#each entry as part, part_index (part_index)}
										<div class={part.style ? PART_CLASSES[part.style] : ''}>{part.style === 'quote' ? `“${part.text}”` : part.text}</div>
									{/each}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm italic opacity-60">{section.empty}</p>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</section>
