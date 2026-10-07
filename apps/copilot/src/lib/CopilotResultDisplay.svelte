<script lang="ts">
	import { get_no_notes_text, get_no_tnn_text } from '$lib/lookups'
	import { m } from '$lib/paraglide/messages'
	import type { CopilotNote, CopilotResult, VerseReference } from '@tabitha/types'
	import type { CopilotSettings } from './types'

	let { result, settings }: { result: CopilotResult, settings: CopilotSettings } = $props()
</script>

{#snippet empty_section(text: string)}
	<p class="text-base-content/70">{text}</p>
{/snippet}

{#snippet semantic_notes(notes: CopilotNote[])}
	{#if notes.length === 0}
		{@render empty_section(get_no_notes_text(settings.lwc))}
	{:else}
		<ul class="list list-disc text-base ms-5">
			{#each notes as note}
				<li>
					{#if note.quoted_text}
						"...{note.quoted_text}..." -
					{/if}
					{note.meaning} {note.check}
					{#if settings.show_note_sources}
						<ul class="list ms-5">
							<li><span class="font-semibold">{note.trigger.name}</span> (weight {note.trigger.weight})</li>
							<li>
								<ul class="list ms-5">
									{#each note.trigger.flags as flag}
										<li><span class="font-semibold">{flag.name}</span> - {flag.value} (weight {flag.weight}) - {JSON.stringify(flag.encoding_anchor)}</li>
									{/each}
								</ul>
							</li>
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#if result?.type === 'error'}
	<div class="text-error">{result.error}</div>

{:else if result?.type === 'discern'}
	<div class="w-full pb-8">
		{#if settings.lwc === 'English' || settings.show_english}
			<div class="mt-3">
				<div class="prose"><h4>{m.english_text()}</h4></div>
				<p>{result.english_text}</p>
			</div>
		{/if}

		{#if result.lwc_text && settings.lwc !== 'English'}
			<div class="mt-3">
				<div class="prose"><h4>{m.lwc_text({ lwc: settings.lwc })}</h4></div>
				<p>{result.lwc_text}</p>
			</div>
		{/if}

		<div class="mt-3">
			<div class="prose"><h4>{m.notes_cautions()}</h4></div>
			{@render semantic_notes(result.notes)}
		</div>
	</div>
{:else if result?.type === 'brief'}
	<div class="w-full pb-8">
		<div class="mt-3">
			<div class="prose"><h4>{m.lwc_named_text({ lwc: settings.lwc })}</h4></div>
			<p>{result.lwc_text}</p>
		</div>

		<div class="mt-3">
			<div class="prose"><h4>{m.semantic_notes()}</h4></div>
			{@render semantic_notes(result.semantic_notes)}
		</div>

		<div class="mt-3">
			<div class="prose"><h4>{m.tnn_notes()}</h4></div>
			{#if result.tnn_notes.length === 0}
				{@render empty_section(get_no_tnn_text({ lwc: settings.lwc, tnn_available: result.tnn_available }))}
			{:else}
				<ul class="list list-disc text-base ms-5">
					{#each result.tnn_notes as note}
						<li>{note}</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if result.cultural_background.length > 0}
			<div class="mt-3">
				<div class="prose"><h4>{m.cultural_background()}</h4></div>
				<ul class="list list-disc text-base ms-5">
					{#each result.cultural_background as { term, summary }}
						<li>{term} - {summary}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.image_keywords.length > 0}
			<div class="mt-3">
				<div class="prose"><h4>{m.image_keywords()}</h4></div>
				<ul class="list list-disc text-base ms-5">
					{#each result.image_keywords as kw}
						<li>{kw}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.consultant_decisions.length > 0}
			<div class="mt-3">
				<div class="prose"><h4>{m.consultant_decisions()}</h4></div>
				<ul class="list list-disc text-base ms-5">
					{#each result.consultant_decisions as { status, text }}
						<li>{status} - {text}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}
