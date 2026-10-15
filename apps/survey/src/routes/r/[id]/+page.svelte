<script lang="ts">
	import { page } from '$app/state'
	import Output from '#lib/Output.svelte'
	import ScoreSheet from '#lib/ScoreSheet.svelte'
	import { ResponseSaver } from '#lib/response_saver.svelte.js'
	import { empty_response, is_answered, MAX_NAME_LENGTH, resume_index } from '#lib/responses.js'
	import type { ReviewResponse } from '#lib/types.js'

	let { data } = $props()

	const survey_id = $derived(page.params.id ?? '')
	const definition = $derived(data.survey.definition)
	const items = $derived(data.survey.items)
	const saver = $derived(new ResponseSaver(survey_id))
	const saved_responses = $derived<Record<string, ReviewResponse>>(Object.fromEntries(data.responses.map(response => [response.item_key, response])))

	// Each starts from what the server loaded and is then changed locally. They're writable
	// deriveds, so opening a different survey's link resets them.
	let responses = $derived(saved_responses)
	let index = $derived(resume_index({ item_keys: items.map(listed => listed.key), responses: saved_responses }))
	let saved_name = $derived(data.reviewer_name)
	let name_draft = $derived(data.reviewer_name)
	let name_problem = $state('')

	const item = $derived(items[index])
	const answered_count = $derived(items.filter(listed => is_answered(responses[listed.key])).length)

	async function save_name(event: SubmitEvent) {
		event.preventDefault()
		const result = await fetch(`/r/${survey_id}/name`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: name_draft }),
		})
		if (!result.ok) {
			name_problem = ((await result.json().catch(() => null)) as { message?: string } | null)?.message ?? "That didn't save. Try again."
			return
		}
		saved_name = ((await result.json()) as { name: string }).name
		name_draft = saved_name
		name_problem = ''
	}

	function update(response: ReviewResponse) {
		responses = { ...responses, [response.item_key]: response }
		saver.queue(response)
	}

	function go_to(next: number) {
		saver.flush()
		index = Math.min(Math.max(next, 0), items.length - 1)
		document.getElementById('item')?.scrollIntoView({ block: 'start' })
	}
</script>

<svelte:head>
	<title>{definition.title} | Survey | TaBiThA</title>
</svelte:head>

<svelte:window onbeforeunload={() => saver.flush()} />

<div class="mx-auto grid max-w-7xl gap-6">
	<header>
		<h1 class="text-3xl font-semibold">{definition.title}</h1>
		<p class="opacity-75">{definition.description}</p>
	</header>

	<details open={!saved_name} class="collapse collapse-arrow border border-base-300 bg-base-100">
		<summary class="collapse-title font-semibold">How to review</summary>
		<ul class="collapse-content list-disc space-y-1 pl-10">
			{#each definition.instructions as instruction (instruction)}
				<li>{instruction}</li>
			{/each}
		</ul>
	</details>

	{#if !saved_name}
		<form onsubmit={save_name} class="card card-border max-w-md bg-base-100">
			<div class="card-body">
				<label class="fieldset">
					<span class="fieldset-legend text-base">Your name</span>
					<input bind:value={name_draft} required maxlength={MAX_NAME_LENGTH} autocomplete="name" placeholder="e.g. Mikayla" class="input w-full" />
					<span class="label">So whoever reads the results knows whose scores these are.</span>
				</label>
				{#if name_problem}<p class="text-error">{name_problem}</p>{/if}
				<button type="submit" class="btn btn-primary">Start</button>
			</div>
		</form>
	{:else}
		<div class="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
			<nav aria-label="Items" class="card card-border max-h-72 overflow-y-auto bg-base-100 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
				<div class="card-body gap-3 p-3">
					<form onsubmit={save_name} class="join">
						<label class="sr-only" for="reviewer-name">Your name</label>
						<input id="reviewer-name" bind:value={name_draft} required maxlength={MAX_NAME_LENGTH} autocomplete="name" class="input input-sm join-item w-full" />
						<button type="submit" disabled={name_draft.trim() === saved_name} class="btn btn-sm join-item">Rename</button>
					</form>
					{#if name_problem}<p class="text-sm text-error">{name_problem}</p>{/if}
					<p class="text-sm opacity-75"><strong class="tabular-nums">{answered_count} of {items.length}</strong> answered</p>
					<ol class="menu menu-sm w-full p-0">
						{#each items as listed, listed_index (listed.key)}
							<li>
								<button type="button" aria-current={listed_index === index ? 'true' : undefined} onclick={() => go_to(listed_index)} class={listed_index === index ? 'menu-active' : ''}>
									<span class="w-4 text-success" aria-label={is_answered(responses[listed.key]) ? 'answered' : undefined}>{is_answered(responses[listed.key]) ? '✓' : ''}</span>
									<span>
										{listed.title}
										<span class="block text-xs opacity-60">{listed.chips.join(' · ')}</span>
									</span>
								</button>
							</li>
						{/each}
					</ol>
				</div>
			</nav>

			<article id="item" class="grid min-w-0 gap-5">
				<div class="flex flex-wrap items-baseline gap-2">
					<h2 class="text-2xl font-semibold">{item.title}</h2>
					{#each item.chips as chip (chip)}
						<span class="badge badge-outline badge-sm">{chip}</span>
					{/each}
					{#if item.note}<p class="w-full text-sm opacity-75">In the set because: {item.note}</p>{/if}
				</div>

				{#if item.context.length}
					<section aria-label="Context" class="card card-border bg-base-100">
						<div class="card-body gap-3">
							{#each item.context as block (block.label)}
								<div>
									<div class="text-xs font-semibold uppercase tracking-wide opacity-60">{block.label}</div>
									<blockquote class="font-serif text-lg">{block.text}</blockquote>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<div class="grid gap-4 md:grid-cols-2">
					<Output side="a" output={item.outputs.a} />
					<Output side="b" output={item.outputs.b} />
				</div>

				{#key item.key}
					<ScoreSheet rubric={definition.rubric} response={responses[item.key] ?? empty_response(item.key)} onchange={update} />
				{/key}

				<div class="flex flex-wrap items-center justify-between gap-3">
					<p role="status" class="text-sm {saver.status === 'error' ? 'text-error' : 'opacity-75'}">
						{#if saver.status === 'saving'}Saving…{:else if saver.status === 'saved'}Saved{:else if saver.status === 'error'}
							{saver.message}
							<button type="button" onclick={() => saver.flush()} class="link">Try again</button>
						{/if}
					</p>
					<div class="flex gap-2">
						<button type="button" disabled={index === 0} onclick={() => go_to(index - 1)} class="btn">Previous</button>
						<button type="button" disabled={index === items.length - 1} onclick={() => go_to(index + 1)} class="btn btn-primary">Next</button>
					</div>
				</div>
			</article>
		</div>
	{/if}
</div>
