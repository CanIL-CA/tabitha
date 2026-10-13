<script lang="ts">
	import { lwc_info, copilot_modes } from '#lib/lookups.js'
	import { MODE_LABELS, MTT_LEVEL_LABELS } from '#lib/labels.js'
	import { m } from '#lib/paraglide/messages.js'
	import Dialog from './Dialog.svelte'
	import LanguageProfile from './LanguageProfile.svelte'
	import Icon from '@iconify/svelte'
	import type { CopilotSettings } from '#lib/types.js'

	type Props = {
		settings: CopilotSettings
	}
	let { settings = $bindable() }: Props = $props()

	let show_settings_dialog = $state(false)
	function change_settings() {
		show_settings_dialog = true
	}
	function close_settings() {
		show_settings_dialog = false
	}
	
	let show_profile_dialog = $state(false)
	function change_profile() {
		show_profile_dialog = true
	}
	function close_profile() {
		show_profile_dialog = false
	}
</script>

<button onclick={change_settings} class="btn btn-md">
	<Icon icon="material-symbols:settings" class="h-5 w-5" />
	{m.settings()}
</button>

<button onclick={change_profile} class="btn btn-md">
	<Icon icon="mdi:playlist-edit" class="h-6 w-6" />
	{m.language_profile()}
</button>

{#if show_settings_dialog}
	<Dialog heading={m.settings_heading()} onclose={close_settings} fit_content>
		<div class="text-sm">
			<div class="mb-2 grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-2">
				<label for="settings-sensitivity">{m.sensitivity()}</label>
				<select id="settings-sensitivity" bind:value={settings.sensitivity} class="select">
					{#each [1, 2, 3, 4, 5] as sentitivity_level}
						<option value={sentitivity_level}>{sentitivity_level}</option>
					{/each}
				</select>

				<label for="settings-mtt-level">{m.detail_level()}</label>
				<select id="settings-mtt-level" bind:value={settings.mtt_level} class="select">
					{#each Object.entries(MTT_LEVEL_LABELS) as [mtt_level, label]}
						<option value={mtt_level}>{label()}</option>
					{/each}
				</select>

				<label for="settings-lwc">{m.lwc()}</label>
				<div class="flex flex-col gap-2">
					<select id="settings-lwc" bind:value={settings.lwc} class="select">
						{#each Object.keys(lwc_info) as lwc}
							<option value={lwc}>{lwc}</option>
						{/each}
					</select>
					{#if settings.lwc !== 'English'}
						<label>
							<input type="checkbox" bind:checked={settings.show_english} />
							{m.show_english()}
						</label>
					{/if}
				</div>

				<label for="settings-mode">{m.mode()}</label>
				<select id="settings-mode" bind:value={settings.mode} class="select">
					{#each copilot_modes as mode}
						<option value={mode}>{MODE_LABELS[mode]()}</option>
					{/each}
				</select>
			</div>
			<div>
				<label>
					<input type="checkbox" bind:checked={settings.show_note_sources} />
					{m.show_note_sources()}
				</label>
			</div>
		</div>
	</Dialog>
{/if}

{#if show_profile_dialog}
	<Dialog heading={m.language_profile()} onclose={close_profile}>
		<LanguageProfile bind:profile={settings.language_profile} />
	</Dialog>
{/if}