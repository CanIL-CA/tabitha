<script lang="ts">
	import { testament } from '@tabitha/types/patterns'
	import type { Option, Options } from '#lib/types.js'

	type Props = {
		options: Options
		selected?: Option
		onselect: (option: Option) => void
	}

	let { options, selected, onselect }: Props = $props()

	const id = $props.id()
	const popover_id = `bible-filter-${id}`
	const anchor_name = `--bible-filter-anchor-${id}`

	const TESTAMENTS = ['Old Testament', 'New Testament'] as const

	let books = $derived([...options].filter(option => option !== 'Any'))
	let books_by_testament = $derived(
		TESTAMENTS.map(name => [name, books.filter(book => testament(book) === name)] as const)
			.filter(([, testament_books]) => testament_books.length > 0),
	)

	let popover_element: HTMLElement | undefined = $state()

	function select(option: Option) {
		onselect(option)
		popover_element?.hidePopover()
	}
</script>

<fieldset class="fieldset">
	<legend class="fieldset-legend text-info-content">Book</legend>

	<button
		type="button"
		popovertarget={popover_id}
		style="anchor-name: {anchor_name}"
		class="select text-base-content"
	>
		{selected ?? 'Any'}
	</button>

	<ul
		bind:this={popover_element}
		popover="auto"
		id={popover_id}
		style="position-anchor: {anchor_name}"
		class="dropdown menu bg-base-100 text-base-content rounded-box shadow-sm max-h-96 overflow-y-auto flex-nowrap"
	>
		<li>
			<button type="button" class:menu-active={(selected ?? 'Any') === 'Any'} onclick={() => select('Any')}>
				Any
			</button>
		</li>

		{#each books_by_testament as [name, testament_books]}
			<li>
				<button type="button" class:menu-active={selected === name} onclick={() => select(name)}>
					{name}
				</button>

				<ul>
					{#each testament_books as book}
						<li>
							<button type="button" class:menu-active={selected === book} onclick={() => select(book)}>
								{book}
							</button>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>
</fieldset>
