<script lang="ts">
	import Icon from '@iconify/svelte'
	import type { OntologyUser } from './types'

	let { user }: { user: OntologyUser } = $props()
	let action = $derived(user.permissions.can_add ? 'Add' : 'Suggest')
</script>

<a href="/protected/concept/create" class="btn btn-accent">
	<Icon icon="material-symbols:add" class="w-4 h-4" />
	{action} Concept
</a>
