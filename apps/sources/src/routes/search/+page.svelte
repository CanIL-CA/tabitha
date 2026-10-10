<script lang="ts">
	import EncodingStatus from '#lib/EncodingStatus.svelte'

	let { data } = $props()

	let results = $derived(data.results)
	let is_truncated = $derived(results.total_count > results.hits.length)
</script>

<svelte:head>
	<title>{data.q} - Phase 1 search - TaBiThA Sources</title>
</svelte:head>

<section class="prose max-w-none mb-5">
	<h2>Phase 1 search</h2>
	<p>
		Verses whose Phase 1 encoding contains every word searched for, anywhere in the verse.
		Wrap words in quotes to match them as an exact phrase, e.g. <code>"the people of Israel"</code>.
	</p>
</section>

{#if !results.terms.length}
	<p>Enter words or a quoted phrase in the search box above.</p>
{:else if !results.hits.length}
	<p>No verses found for <strong>{data.q}</strong>.</p>
{:else}
	<p class="mb-3">
		{#if is_truncated}
			Showing the first {results.hits.length} of {results.total_count} verses
		{:else}
			{results.total_count} {results.total_count === 1 ? 'verse' : 'verses'}
		{/if}
		for <strong>{data.q}</strong>
	</p>

	<ul class="list bg-base-100 rounded-box shadow-sm">
		{#each results.hits as { reference, status, segments } (`${reference.id_primary} ${reference.id_secondary}:${reference.id_tertiary}`)}
			{@const verse_path = `/${reference.type}/${reference.id_primary}/${reference.id_secondary}/${reference.id_tertiary}`}
			<li class="list-row items-start">
				<div class="flex flex-col gap-1 w-40">
					<a href={verse_path} class="link link-primary font-semibold">
						{reference.id_primary} {reference.id_secondary}:{reference.id_tertiary}
					</a>
					<EncodingStatus {status} classes="badge-sm" />
				</div>
				<p class="list-col-grow">
					{#each segments as { text, is_match }, index (index)}
						{#if is_match}<mark class="bg-transparent text-current font-semibold italic">{text}</mark>{:else}{text}{/if}
					{/each}
				</p>
			</li>
		{/each}
	</ul>
{/if}
