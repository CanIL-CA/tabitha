<script lang="ts">
	import { polished_books } from '#lib/lookups.js'
	import { m } from '#lib/paraglide/messages.js'

	let { book = $bindable(), disabled = false }: { book: string, disabled?: boolean } = $props()

	const NT_index_start = polished_books.findIndex(book => book === 'Matthew')
	const OT_books = polished_books.slice(0, NT_index_start)
	const NT_books = polished_books.slice(NT_index_start)
</script>

<select bind:value={book} {disabled} class="select w-60">
	<optgroup label={m.old_testament()}>
		{#each OT_books as book}
			<option value={book}>{book}</option>
		{/each}
	</optgroup>
	<optgroup label={m.new_testament()}>
		{#each NT_books as book}
			<option value={book}>{book}</option>
		{/each}
	</optgroup>
	<!--TODO add info popup explaining the limitation-->
</select>
