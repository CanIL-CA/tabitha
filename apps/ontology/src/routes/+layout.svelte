<script lang="ts">
	import '$lib/app.css'

	import { onMount } from 'svelte'
	import { page } from '$app/state'
	import { Search } from '$lib'
	import { Header, Footer, theme_state } from '@tabitha/ui'
	import { signIn, signOut } from '@auth/sveltekit/client'
	import Icon from '@iconify/svelte'
	import { registerSW } from 'virtual:pwa-register'
	import { sync_pending } from '$lib/offline/sync'
	import { report_active_theme } from '@tabitha/usage/client'

	let { data, children } = $props()

	let user = $derived(data.user)
	let version = $derived(data.version)
	let show_search_bar = $derived(page.url.pathname === '/')

	// No-op instead of the default forced reload: the page picks up a new version on its next navigation.
	registerSW({ immediate: true, onNeedReload: () => {} })

	async function sign_out() {
		// https://next-auth.js.org/getting-started/client#signout
		await signOut({ callbackUrl: '/' })
	}

	onMount(() => {
		// Catches anything left over from a previous visit that never made it to the server --
		// the `online` event alone wouldn't fire for a tab that was fully closed while offline.
		sync_pending()
		report_active_theme(theme_state.current)

		window.addEventListener('online', sync_pending)
		return () => window.removeEventListener('online', sync_pending)
	})
</script>

<!-- layout not handled by daisyUI, https://daisyui.com/docs/layout-and-typography -->

<Header app="Ontology">
	{#if show_search_bar}
		<Search autofocus />
	{/if}
</Header>

<main class="mx-8 mt-8">
	<div class="relative -top-2 w-fit text-sm font-mono text-base-content/60">{version}</div>

	{@render children?.()}
</main>

<!-- https://daisyui.com/components/footer -->
<Footer colors="bg-accent text-accent-content">
	{#if user}
		<div class="flex items-center gap-4">
			<span class="font-serif text-lg tracking-widest">{user.name}</span>

			<button onclick={sign_out} class="btn btn-sm btn-outline btn-error">
				<Icon icon="material-symbols:logout-rounded" class="h-5 w-5" />
			</button>
		</div>

		<span class="text-sm italic">
			{user.email}
		</span>
	{:else}
		<button onclick={() => signIn('google')} class="btn btn-sm btn-outline btn-success">
			Sign in to see additional features
		</button>
	{/if}

	<div class="divider w-full divider-accent"></div>
	<a href="/downloads" class="link link-hover">Ontology downloads</a>
	<a href="/history" class="link link-hover">Ontology change log</a>
	{#if data.user?.permissions.has_protected_access}
		<a href="/protected" class="link link-hover">Ontology management</a>
	{/if}
</Footer>
