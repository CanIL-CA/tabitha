<script lang="ts">
	import type { EntityContextMenuData } from '#lib/edit/types.js'
	import type { FeatureMap, PageSourceEntity } from '#lib/types.js'
	import ConceptDialog from '#lib/ConceptDialog.svelte'
	import { entity_clipboard } from './clipboard.svelte'
	import { DEFAULTS } from './default_entities'
	import { page } from '$app/state'
	import { fill_in_features } from '#lib/encoding/features.js'

	type Props = {
		source_entities: PageSourceEntity[]
		data: EntityContextMenuData
		onclose: () => void
		onclose_and_recalculate: () => void
	}
	let { source_entities = $bindable(), data, onclose, onclose_and_recalculate }: Props = $props()

	let parent_category = $derived.by(() => {
		const entity = source_entities[data.entity_id]
		if (!entity || entity.parent_id === -1) {
			return null
		}
		return source_entities[entity.parent_id]?.category || null
	})

	function insert_entities(entities: PageSourceEntity[]) {
		const new_entities = entities.map(entity => ({
			...entity,
			...fill_in_features({ source_entity: entity, feature_map: page.data.features as FeatureMap }),
		}))
		
		source_entities.splice(data.entity_id, 0, ...new_entities)
		onclose_and_recalculate()
	}

	function insert_entity(entity: PageSourceEntity) {
		insert_entities([entity])
	}

	function insert_clause(clause: PageSourceEntity) {
		insert_entities([
			clause,
			...clause.value === '{' ? [DEFAULTS.PERIOD] : [],
			boundary_end(clause),
		])
	}

	function insert_phrase({ phrase, concept }: { phrase: PageSourceEntity, concept: PageSourceEntity }) {
		insert_entities([
			phrase,
			...concept?.concept?.stem ? [concept] : [],
			boundary_end(phrase),
		])
	}

	function boundary_end(boundary_start: PageSourceEntity): PageSourceEntity {
		const end_map: Record<string, string> = {
			'{': '}',
			'[': ']',
			'(': ')',
		}
		return {
			...DEFAULTS.EMPTY,
			value: end_map[boundary_start.value] || ')',
			boundary_category: boundary_start.boundary_category,
		}
	}

	function paste_entities() {
		const new_entities = entity_clipboard.paste()
		if (new_entities !== null) {
			source_entities.splice(data.entity_id, 0, ...new_entities)
			onclose_and_recalculate()
		} else {
			onclose()
		}
	}
	
	let dialog_open = $state(false)
	let new_concept_entity = $state<PageSourceEntity | null>(null)
	let new_phrase_entity = $state<PageSourceEntity | null>(null)

	function open_concept_dialog({ concept, phrase }: { concept: PageSourceEntity, phrase?: PageSourceEntity }) {
		new_concept_entity = concept
		new_phrase_entity = phrase || null
		dialog_open = true
	}
	function close_concept_dialog() {
		dialog_open = false

		if (new_phrase_entity && new_concept_entity) {
			insert_phrase({ phrase: new_phrase_entity, concept: new_concept_entity })
		} else if (new_concept_entity?.concept?.stem) {
			insert_entity(new_concept_entity)
		} else {
			onclose()
		}
	}

	type MenuItem = {
		label: string
		action: () => void
		condition: boolean
	}
	let menu_data: [string, MenuItem[]][] = $derived([
		['Clause', [
			{
				label: 'Main Clause',
				action: () => insert_clause(DEFAULTS.CLAUSE_MAIN),
				condition: !parent_category,
			},
			{
				label: 'Adverbial Clause',
				action: () => insert_clause(DEFAULTS.CLAUSE_ADVERBIAL),
				condition: parent_category === 'Clause',
			},
			{
				label: 'Patient (Object Complement)',
				action: () => insert_clause(DEFAULTS.CLAUSE_PATIENT),
				condition: parent_category === 'Clause',
			},
			{
				label: 'Agent (Subject Complement)',
				action: () => insert_clause(DEFAULTS.CLAUSE_AGENT),
				condition: parent_category === 'Clause',
			},
			{
				label: 'Closing Quotation Frame',
				action: () => insert_clause(DEFAULTS.CLAUSE_CLOSE_QUOTE),
				condition: parent_category === 'Clause',
			},
			{
				label: 'Relative Clause',
				action: () => insert_clause(DEFAULTS.CLAUSE_RELATIVE),
				condition: parent_category === 'Noun Phrase',
			},
			{
				label: 'Adjectival Complement',
				action: () => insert_clause(DEFAULTS.CLAUSE_ADJ_PATIENT),
				condition: parent_category === 'Adjective Phrase',
			},
		]],
		['Phrase', [
			{
				label: 'Noun Phrase',
				action: () => open_concept_dialog({ concept: DEFAULTS.NOUN, phrase: DEFAULTS.NOUN_PHRASE }),
				condition: !!parent_category && parent_category !== 'Verb Phrase',
			},
			{
				label: 'Verb Phrase',
				action: () => open_concept_dialog({ concept: DEFAULTS.VERB, phrase: DEFAULTS.VERB_PHRASE }),
				condition: parent_category === 'Clause',
			},
			{
				label: 'Adjective Phrase',
				action: () => open_concept_dialog({ concept: DEFAULTS.ADJECTIVE, phrase: DEFAULTS.ADJECTIVE_PHRASE_PREDICATIVE }),
				condition: parent_category === 'Clause',
			},
			{
				label: 'Adjective Phrase',
				action: () => open_concept_dialog({ concept: DEFAULTS.ADJECTIVE, phrase: DEFAULTS.ADJECTIVE_PHRASE }),
				condition: !!parent_category && parent_category !== 'Clause' && parent_category !== 'Verb Phrase',
			},
			{
				label: 'Adverb Phrase',
				action: () => open_concept_dialog({ concept: DEFAULTS.ADVERB, phrase: DEFAULTS.ADVERB_PHRASE }),
				condition: !!parent_category && parent_category !== 'Verb Phrase',
			},
		]],
		['Concept', [
			{
				label: 'Noun',
				action: () => open_concept_dialog({ concept: DEFAULTS.NOUN }),
				condition: parent_category === 'Noun Phrase',
			},
			{
				label: 'Verb',
				action: () => open_concept_dialog({ concept: DEFAULTS.VERB }),
				condition: parent_category === 'Verb Phrase',
			},
			{
				label: 'Adjective',
				action: () => open_concept_dialog({ concept: DEFAULTS.ADJECTIVE }),
				condition: parent_category === 'Adjective Phrase',
			},
			{
				label: 'Adverb',
				action: () => open_concept_dialog({ concept: DEFAULTS.ADVERB }),
				condition: parent_category === 'Adverb Phrase',
			},
			{
				label: 'Adposition',
				action: () => open_concept_dialog({ concept: DEFAULTS.ADPOSITION }),
				condition: !!parent_category,
			},
			{
				label: 'Conjunction',
				action: () => open_concept_dialog({ concept: DEFAULTS.CONJUNCTION }),
				condition: !!parent_category,
			},
			{
				label: 'Particle',
				action: () => open_concept_dialog({ concept: DEFAULTS.PARTICLE }),
				condition: !!parent_category,
			},
			{
				label: 'Phrasal',
				action: () => open_concept_dialog({ concept: DEFAULTS.PHRASAL }),
				condition: !!parent_category,
			},
		]],
		['Other', [
			{
				label: 'paragraph',
				action: () => insert_entity(DEFAULTS.PARAGRAPH),
				condition: !parent_category,
			},
			{
				label: 'period',
				action: () => insert_entity(DEFAULTS.PERIOD),
				condition: parent_category === 'Clause',
			},
		]],
	])
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div onclick={e => e.stopPropagation()}
	onkeydown={e => e.stopPropagation()}
	onmouseleave={() => !dialog_open && onclose()}
	style="left: {data.x}px; top: {data.y}px;"
	class="card shadow-lg bg-base-100 min-w-40 fixed z-60"
>
	<ul class="menu menu-paged menu-vertical w-full min-h-40">
		{#if entity_clipboard.has_value()}
			<li><button onclick={paste_entities}>Paste - {entity_clipboard.peek()?.category_abbr}</button></li>
			<li></li>
		{/if}
		{#each menu_data as [menu_label, items]}
			{@const subitems_to_show = items.filter(item => item.condition)}
			{#if subitems_to_show.length}
				<li>
					<details>
						<summary>{menu_label}</summary>
						<ul>
							{#each subitems_to_show as { label, action }}
								<li><button onclick={action}>{label}</button></li>
							{/each}
						</ul>
					</details>
				</li>
			{/if}
		{/each}
	</ul>
</div>

{#if dialog_open && !!new_concept_entity?.concept}
	<ConceptDialog bind:concept={new_concept_entity.concept} onclose={close_concept_dialog} />
{/if}