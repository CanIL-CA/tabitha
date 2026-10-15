<script lang="ts">
	import { page } from '$app/state'
</script>

<svelte:head>
	<title>{page.status} | Survey | TaBiThA</title>
</svelte:head>

<div class="prose max-w-prose">
	<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
	<p>{page.error?.message}</p>
</div>
