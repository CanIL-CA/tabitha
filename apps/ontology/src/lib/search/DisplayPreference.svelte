<script lang="ts">
	import Icon from '@iconify/svelte'

	type Props = {
		preference?: 'grid' | 'table'
		onpreference?: (preference: 'grid' | 'table') => void
	}

	let { preference = $bindable('grid'), onpreference }: Props = $props()

	function set_preference(new_preference: 'grid' | 'table') {
		preference = new_preference
		onpreference?.(new_preference)
	}
</script>

<div class="join">
	<button
		type="button"
		title="Grid View"
		onclick={() => set_preference('grid')}
		class="btn join-item"
		class:btn-accent={preference === 'grid'}
	>
		<Icon icon="mdi:view-grid" class="h-5 w-5" />
	</button>

	<button
		type="button"
		title="Table View"
		onclick={() => set_preference('table')}
		class="btn join-item"
		class:btn-accent={preference === 'table'}
	>
		<Icon icon="uiw:table" class="h-5 w-5" />
	</button>
</div>
