<script lang="ts">
	import Icon from '@iconify/svelte'
	import ValueGroups from './ValueGroups.svelte'
	import { m } from '$lib/paraglide/messages'
	import type { LanguageProfile } from '$lib/types'

	type Props = {
		profile: LanguageProfile
	}
	let { profile = $bindable() }: Props = $props()

	const noun_number_options = [
		{ value: 'Dual', label: m.noun_number_dual },
		{ value: 'Trial', label: m.noun_number_trial },
		{ value: 'Quadrial', label: m.noun_number_quadrial },
	]
	const noun_proximity_options = [
		{ value: 'Near Speaker and Listener', label: m.proximity_near_speaker_and_listener },
		{ value: 'Near Speaker', label: m.proximity_near_speaker },
		{ value: 'Near Listener', label: m.proximity_near_listener },
		{ value: 'Remote within Sight', label: m.proximity_remote_within_sight },
		{ value: 'Remote out of Sight', label: m.proximity_remote_out_of_sight },
		{ value: 'Temporally Near', label: m.proximity_temporally_near },
		{ value: 'Temporally Remote', label: m.proximity_temporally_remote },
		{ value: 'Contextually Near with Focus', label: m.proximity_contextually_near_with_focus },
		{ value: 'Contextually Near', label: m.proximity_contextually_near },
	]
	const modifier_degree_options = [
		{ value: 'Comparative', label: m.degree_comparative },
		{ value: 'Superlative', label: m.degree_superlative },
		{ value: 'Intensified', label: m.degree_intensified },
		{ value: 'Extremely Intensified', label: m.degree_extremely_intensified },
		{ value: "'too'", label: m.degree_too },
		{ value: "'less'", label: m.degree_less },
		{ value: "'least'", label: m.degree_least },
		{ value: 'Equality', label: m.degree_equality },
		{ value: 'Intensified Comparative', label: m.degree_intensified_comparative },
		{ value: "Intensified 'less'", label: m.degree_intensified_less },
		{ value: 'Superlative of 2 items', label: m.degree_superlative_2_items },
	]
</script>

{#snippet info_popup(info: string)}
	<div class="dropdown dropdown-hover dropdown-right dropdown-center">
		<div role="button" class="btn btn-circle btn-ghost btn-xs text-info">
			<Icon icon="mdi:information-slab-circle-outline" class="h-4 w-4" />
		</div>
		<div class="card card-sm dropdown-content bg-base-100 rounded-box w-80 shadow-sm">
			<div class="card-body">
				{info}
			</div>
		</div>
	</div>
{/snippet}

<div class="text-sm">
	<table class="table table-sm">
		<tbody>
			<tr>
				<td>
					{m.verb_tense()}
					{@render info_popup(m.verb_tense_info())}
				</td>
				<td>
					<div class="flex flex-col gap-1">
						<label>
							<input type="checkbox" bind:checked={profile.multiple_past} class="checkbox checkbox-sm" />
							{m.multiple_past()}
						</label>
						<label>
							<input type="checkbox" bind:checked={profile.multiple_future} class="checkbox checkbox-sm" />
							{m.multiple_future()}
						</label>
					</div>
				</td>
			</tr>
			<tr>
				<td>
					{m.noun_number()}
					{@render info_popup(m.noun_number_info())}
				</td>
				<td>
					<div class="flex flex-col gap-1">
						{#each noun_number_options as { value, label }}
							<label>
								<input type="checkbox" {value} bind:group={profile.noun_number} class="checkbox checkbox-sm" />
								{label()}
							</label>
						{/each}
					</div>
				</td>
			</tr>
			<tr>
				<td>
					{m.noun_proximity()}
					{@render info_popup(m.noun_proximity_info())}
				</td>
				<td>
					<ValueGroups options={noun_proximity_options} bind:groups={profile.noun_proximity} />
				</td>
			</tr>
			<tr>
				<td>
					{m.noun_person()}
					{@render info_popup(m.noun_person_info())}
				</td>
				<td>
					<label>
						<input type="checkbox" bind:checked={profile.noun_clusivity} class="checkbox checkbox-sm" />
						{m.noun_clusivity()}
					</label>
				</td>
			</tr>
			<tr>
				<td>
					{m.modifier_degree()}
					{@render info_popup(m.modifier_degree_info())}
				</td>
				<td>
					<ValueGroups options={modifier_degree_options} bind:groups={profile.modifier_degree} />
				</td>
			</tr>
			<tr>
				<td>
					{m.passive_voice()}
					{@render info_popup(m.passive_voice_info())}
				</td>
				<td>
					<select bind:value={profile.passive} class="select select-sm">
						<option value="none">{m.passive_none()}</option>
						<option value="agent_forbidden">{m.passive_agent_forbidden()}</option>
						<option value="agent_allowed">{m.passive_agent_allowed()}</option>
						<option value="other">{m.passive_other()}</option>
					</select>
				</td>
			</tr>
			<tr>
				<td>
					{m.rhetorical_questions()}
					{@render info_popup(m.rhetorical_questions_info())}
				</td>
				<td>
					<select bind:value={profile.rhetorical_questions} class="select select-sm">
						<option value={true}>{m.rhetorical_questions_understood()}</option>
						<option value={false}>{m.rhetorical_questions_statements_preferred()}</option>
					</select>
				</td>
			</tr>
			<tr>
				<td>
					{m.speech_formula_position()}
					{@render info_popup(m.speech_formula_position_info())}
				</td>
				<td>
					<select bind:value={profile.speech_formula_position} class="select select-sm">
						<option value="before">{m.position_before()}</option>
						<option value="after">{m.position_after()}</option>
						<option value="either">{m.position_either()}</option>
						<option value="both">{m.position_both()}</option>
					</select>
				</td>
			</tr>
			<tr>
				<td>
					{m.honorifics()}
					{@render info_popup(m.honorifics_info())}
				</td>
				<td>
					<div class="flex flex-col gap-1">
						<label>
							<input type="radio" value={false} bind:group={profile.honorifics} class="radio radio-xs" />
							{m.honorifics_none()}
						</label>
						<label>
							<input type="radio" value={true} bind:group={profile.honorifics} class="radio radio-xs" />
							{m.honorifics_some()}
						</label>
					</div>
				</td>
			</tr>
		</tbody>
	</table>
</div>