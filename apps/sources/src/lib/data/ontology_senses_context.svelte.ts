import { createContext } from 'svelte'
import type { ConceptKey, OntologyResult } from '@tabitha/types'
import { find_sense, find_senses, group_senses_by_concept, type SensesByConcept } from './ontology_senses'

/**
 * The ontology senses a page's components read. Pages set it from their load data; the editor adds
 * senses for a concept picked after the page loaded. Writes only ever come from event handlers, so
 * no effect or derived can end up depending on the state it changes.
 */
export class OntologySenses {
	#loaded: () => SensesByConcept
	#picked = $state<SensesByConcept>({})

	constructor(loaded: () => SensesByConcept) {
		this.#loaded = loaded
	}

	#senses(): SensesByConcept {
		return { ...this.#loaded(), ...this.#picked }
	}

	senses_of(concept: Pick<ConceptKey, 'stem' | 'part_of_speech'>): OntologyResult[] {
		return find_senses({ senses: this.#senses(), concept })
	}

	sense_of(concept: ConceptKey): OntologyResult {
		return find_sense({ senses: this.#senses(), concept })
	}

	remember(results: OntologyResult[]) {
		this.#picked = { ...this.#picked, ...group_senses_by_concept(results) }
	}
}

export const [get_ontology_senses, set_ontology_senses] = createContext<OntologySenses>()
