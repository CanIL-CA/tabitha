<script lang="ts">
	import Icon from '@iconify/svelte'

	let { generate_url }: { generate_url: string } = $props()

	const AUDIENCES = [1, 2, 3, 4]

	let audience = $state(1)
	let generating = $state(false)
	let text = $state('')
	let error_message = $state('')

	async function generate() {
		generating = true
		text = ''
		error_message = ''
		try {
			const response = await fetch(generate_url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ audience }),
			})
			const result = await response.json().catch(() => ({})) as { text?: string, error?: string, message?: string }
			if (response.ok && result.text) text = result.text
			else error_message = result.error ?? result.message ?? `Generation failed (${response.status}).`
		}
		catch {
			error_message = 'Generation failed. Check your connection and try again.'
		}
		finally {
			generating = false
		}
	}
</script>

<div class="card card-border bg-base-200 mb-4">
	<div class="card-body gap-3">
		<div class="flex flex-wrap items-center gap-3">
			<h2 class="card-title text-base">Generate English text</h2>
			<span class="badge badge-warning badge-sm">Experimental</span>
			<div class="ms-auto flex items-center gap-2">
				<label class="select select-sm w-auto">
					<span class="label">Audience</span>
					<select bind:value={audience} disabled={generating}>
						{#each AUDIENCES as audience_option (audience_option)}
							<option value={audience_option}>{audience_option}</option>
						{/each}
					</select>
				</label>
				<button onclick={generate} disabled={generating} class="btn btn-primary btn-sm">
					{#if generating}
						<span class="loading loading-spinner loading-xs"></span>
						Generating…
					{:else}
						<Icon icon="mdi:text-box-outline" class="h-4 w-4" />
						Generate
					{/if}
				</button>
			</div>
		</div>

		{#if text}
			<p class="text-lg">{text}</p>
		{:else if error_message}
			<div role="alert" class="alert alert-error alert-soft">
				<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
				<span>{error_message}</span>
			</div>
		{:else}
			<p class="text-sm opacity-70">Generates this verse's English text from its encoding with TBTA's engine. The first request after a quiet spell can take several seconds.</p>
		{/if}
	</div>
</div>
