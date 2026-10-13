<script lang="ts">
	import type { ConceptKey, SourceEntity } from '@tabitha/types'
	import Word from './Word.svelte'
	import BoundaryEnd from './BoundaryEnd.svelte'
	import BoundaryStart from './BoundaryStart.svelte'
	import Punctuation from './Punctuation.svelte'

	type Props = {
		source_entities: SourceEntity[]
		ontology_base_url: string
		/** lowercased phrase words to highlight matching concepts against, if searching by phrase */
		highlight_terms?: Set<string>
		/** the concept to highlight a matching concept against */
		highlight_concept?: ConceptKey
	}

	let { source_entities, ontology_base_url, highlight_terms, highlight_concept }: Props = $props()

	let main_clauses = $derived(source_entities.reduce((clauses, entity) => {
		if (entity.value === '{') {
			clauses.push([])
		}

		const last_clause = clauses[clauses.length - 1]
		if (last_clause) {
			last_clause.push(entity)
		}

		return clauses
	}, [] as SourceEntity[][]))

	function is_boundary_start(entity: SourceEntity): boolean {
		return ['{', '[', '('].includes(entity.value)
	}

	function is_boundary_end(entity: SourceEntity): boolean {
		return ['}', ']', ')'].includes(entity.value)
	}

	/**
	 * Punctuation has no category of its own to color by, so it borrows its enclosing phrase's --
	 * found by walking back to the nearest boundary-start not already closed by a nested one.
	 */
	function get_parent_category({ entities, index }: { entities: SourceEntity[], index: number }): string {
		let inner_level = 0

		for (let j = index - 1; j >= 0; j--) {
			const entity = entities[j]
			if (is_boundary_start(entity)) {
				if (inner_level === 0) {
					return entity.category_abbr
				}
				inner_level -= 1
			} else if (is_boundary_end(entity)) {
				inner_level += 1
			}
		}

		return ''
	}
</script>

{#each main_clauses as main_clause}
	<div class="hover:bg-base-200 flex flex-wrap items-center">
		{#each main_clause as source_entity, i}
			<span class="entity-{source_entity.category_abbr || get_parent_category({ entities: main_clause, index: i })}">
				{#if is_boundary_start(source_entity)}
					<BoundaryStart {source_entity} />
				{:else if is_boundary_end(source_entity)}
					<BoundaryEnd {source_entity} />
				{:else if source_entity.concept}
					<Word {source_entity} {highlight_terms} {highlight_concept} {ontology_base_url} />
				{:else}
					<Punctuation {source_entity} size="sm" />
				{/if}
			</span>
		{/each}
	</div>
{/each}
