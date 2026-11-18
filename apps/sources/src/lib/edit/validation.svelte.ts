import { untrack } from 'svelte'
import { describe_issue, type DescribedIssue } from '#lib/encoding/validation_messages.js'
import { validate_encoding, type ValidationResult } from '#lib/encoding/validation.js'
import type { SensesByConcept } from '#lib/data/ontology_senses.js'
import type { PageSourceEntity } from '#lib/types.js'

type ValidationOptions = {
	source_entities: () => PageSourceEntity[]
	senses: () => SensesByConcept
	/** Validates the entities as they are when this is created, and starts out shown only if there are issues. */
	show_if_issues?: boolean
}

const NO_ISSUES: ValidationResult = { errors: [], warnings: [] }

/**
 * The validation of the entities being edited. Nothing is validated until `show` is called, and from then on
 * the issues follow the entities, so they never point at entities that have since been edited or moved.
 */
export class Validation {
	is_shown = $state(false)
	result: ValidationResult
	errors: DescribedIssue[]
	warnings: DescribedIssue[]

	constructor({ source_entities, senses, show_if_issues = false }: ValidationOptions) {
		this.result = $derived(
			this.is_shown ? validate_encoding({ source_entities: source_entities(), senses: senses() }) : NO_ISSUES,
		)
		this.errors = $derived(this.result.errors.map(issue => describe_issue({ issue, source_entities: source_entities() })))
		this.warnings = $derived(this.result.warnings.map(issue => describe_issue({ issue, source_entities: source_entities() })))

		if (show_if_issues) {
			// untracked so that whatever creates this does not depend on the entities and start over whenever they are edited
			const { errors, warnings } = untrack(() => validate_encoding({ source_entities: source_entities(), senses: senses() }))
			this.is_shown = errors.length + warnings.length > 0
		}
	}

	show() {
		this.is_shown = true
	}

	hide() {
		this.is_shown = false
	}
}
