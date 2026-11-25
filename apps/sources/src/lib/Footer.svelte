<script lang="ts">
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { Footer as FooterBase } from '@tabitha/ui'
	import Icon from '@iconify/svelte'
	import { auth_client } from '#lib/auth_client.js'

	let user = $derived(page.data.user)

	async function sign_in() {
		await auth_client.signIn.social({ provider: 'google', callbackURL: page.url.href })
	}

	async function sign_out() {
		await auth_client.signOut()
		await goto('/', { refreshAll: true })
	}
</script>

<FooterBase>
	{#if user}
		<div class="flex items-center gap-4">
			<span class="font-serif text-lg tracking-widest">{user.name}</span>

			<button onclick={sign_out} aria-label="Sign out" class="btn btn-sm btn-outline btn-error">
				<Icon icon="material-symbols:logout-rounded" class="h-5 w-5" />
			</button>
		</div>

		<span class="text-sm italic">{user.email}</span>
	{:else}
		<button onclick={sign_in} class="btn btn-sm btn-outline btn-success">
			Sign in to see additional features
		</button>
	{/if}

	<div class="divider w-full"></div>
	<a href="/lookup/status/Bible" class="link link-hover">Bible encoding status</a>
	<a href="/lookup/features" class="link link-hover">Source features list</a>
</FooterBase>
