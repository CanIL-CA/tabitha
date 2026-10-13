<script lang="ts">
	import { onMount } from 'svelte'
	import { navigating, page } from '$app/state'
	import Icon from '@iconify/svelte'
	import { parts_of_speech } from '#lib/lookups.js'

	type Props = {
		autofocus?: boolean
	}

	let { autofocus = false }: Props = $props()

	let value = $derived(page.url.searchParams.get('q') ?? '')
	let category = $derived(page.url.searchParams.get('category') || 'all')
	let scope = $state('stems')

	onMount(() => {
		const requested_scope = page.url.searchParams.get('scope')
		const stored_scope = localStorage.getItem('search_scope')

		scope = requested_scope || stored_scope || 'stems'
	})

	function auto_focus(input: HTMLInputElement) {
		if (autofocus) {
			input.focus()
		}
	}

	function store_scope() {
		// don't store the 'semantic' scope to avoid accidental uses
		if (scope === 'semantic') {
			return
		}
		localStorage.setItem('search_scope', scope)
	}
</script>

<!-- https://developer.mozilla.org/en-US/docs/Web/HTML/Element/search -->
<search>
	<!--
		used role="search" ∵ https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/search#search_form_labels_and_accessibility.
	-->
	<form role="search" action="/" class="join w-full">
		<input
			type="search"
			name="q"
			id="q"
			value={value}
			use:auto_focus
			class="input input-bordered input-lg w-full join-item"
		/>

		<select name="category" value={category} class="select select-lg join-item">
			<option value="all">All Concepts</option>
			{#each parts_of_speech as category_value}
				<option value={category_value}>{category_value}s</option>
			{/each}
		</select>

		<select
			name="scope"
			bind:value={scope}
			onchange={store_scope}
			class="select select-lg join-item {scope === 'semantic' ? 'select-error' : ''}"
		>
			<option value="stems">Stems only</option>
			<option value="glosses">Glosses only</option>
			<option value="all">Stems and Glosses</option>
			<option value="semantic">Semantic Search</option>
			<option value="english">Generated English</option>
		</select>

		<button class="btn btn-primary btn-lg join-item">
			<span class="hidden sm:inline">Search</span>
			<Icon icon="material-symbols:search" class="h-6 w-6" />
		</button>
	</form>

	<progress class="progress progress-warning w-full transition-opacity duration-200 {navigating.to ? 'opacity-100' : 'opacity-0'}"></progress>
</search>
