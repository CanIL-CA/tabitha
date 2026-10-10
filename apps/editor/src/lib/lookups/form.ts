import { PUBLIC_TARGETS_API_HOST } from '$env/static/public'
import { create_targets_client } from '@tabitha/api-client'
import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
import { create_lookup_result } from '#lib/token.js'
import type { Token, LookupResult } from '#lib/types.js'
import type { TargetFormResult, PartOfSpeech } from '@tabitha/types'

const targets_client = create_targets_client({ base_url: PUBLIC_TARGETS_API_HOST, cache: true })

export async function check_forms(lookup_token: Token) {
	// At this point there is always just one lookup term
	// The term is expected to have no sense attached to it
	const term = lookup_token.lookup_terms[0]

	const lookup_results = (await targets_client.lookup_forms({ word: term, project: 'English' }))
		.filter(result => !result.stem.includes(' '))
		.reduce<LookupResult[]>((transformed_results, form_result) => transform_results({ transformed_results, form_result }), [])

	add_missing_forms({ results: lookup_results, term })

	if (lookup_results.length === 0) {
		return
	}

	// The form lookup may have resulted in different stems (eg. saw).
	// So add a lookup term for each unique stem (case-insensitive)
	const unique_stems = new Set(lookup_results.map(({ stem }) => stem.toLowerCase()))

	// Exclude the original lookup stem as it's handled separately
	unique_stems.delete(term.toLowerCase())

	// Keep the original token-based term as the first lookup term
	lookup_token.lookup_terms = [term.toLowerCase(), ...unique_stems]
	lookup_token.lookup_results = lookup_results

	/**
	 * Turn all the form results into LookupResults, such that there is one lookup result
	 * for each unique combination of stem and part-of-speech. If there are multiple lexicon entries
	 * with the same stem and part-of-speech (eg. Judah), simply take the id of the first one
	 * and ignore the others. This is what the Analyzer does.
	 */
	function transform_results({ transformed_results, form_result }: {
		transformed_results: LookupResult[]
		form_result: TargetFormResult
	}): LookupResult[] {
		const existing_result = transformed_results.find(LOOKUP_FILTERS.MATCHES_LOOKUP(form_result))

		if (!existing_result) {
			// This is a new lexical entry
			const new_result = create_lookup_result({ ...form_result, form: form_result.form })
			transformed_results.push(new_result)

		} else if (!existing_result.form.includes(form_result.form.toLowerCase())) {
			// The lexical entry is the same as a previous one, but it has a different form. Include the new form
			existing_result.form = `${existing_result.form}|${form_result.form.toLowerCase()}`

		} else {
			// This would result from a unique lexical entry with the same stem and part-of-speech as a previous one.
			// But since we only need one instance of each form name, we can ignore this result. eg. Judah or Gad
		}

		return transformed_results
	}

	function add_missing_forms({ results, term }: { results: LookupResult[], term: string }) {
		const missing_form = MISSING_FORMS.get(term.toLowerCase())

		// Some missing forms may become not missing before the code here is updated. Avoid duplicate results in that case.
		if (missing_form && !results.some(LOOKUP_FILTERS.MATCHES_LOOKUP(missing_form))) {
			results.push(create_lookup_result({ ...missing_form, form: missing_form.forms }))
		}
	}
}

const MISSING_FORMS = new Map<string, { stem: string, part_of_speech: PartOfSpeech, forms: string }>([
	// TODO add more or remove some when we include Analyzer inflections as well
	// see https://github.com/CanIL-CA/tabitha/issues/92
	['chiefer', { stem: 'chief', part_of_speech: 'Adjective', forms: 'comparative' }],
	['chiefest', { stem: 'chief', part_of_speech: 'Adjective', forms: 'superlative' }],
	['am', { stem: 'be', part_of_speech: 'Verb', forms: 'present' }],
	['are', { stem: 'be', part_of_speech: 'Verb', forms: 'present' }],
	['were', { stem: 'be', part_of_speech: 'Verb', forms: 'past' }],
	['goodbye', { stem: 'goodbye', part_of_speech: 'Verb', forms: 'stem' }],
	['goodbied', { stem: 'goodbye', part_of_speech: 'Verb', forms: 'past|perfect' }],
	['goodbying', { stem: 'goodbye', part_of_speech: 'Verb', forms: 'participle' }],
	['goodbyes', { stem: 'goodbye', part_of_speech: 'Verb', forms: 'present' }],
	['pity', { stem: 'pity', part_of_speech: 'Verb', forms: 'stem' }],
	['pitied', { stem: 'pity', part_of_speech: 'Verb', forms: 'past|perfect' }],
	['pitying', { stem: 'pity', part_of_speech: 'Verb', forms: 'participle' }],
	['pities', { stem: 'pity', part_of_speech: 'Verb', forms: 'present' }],
	['sex', { stem: 'sex', part_of_speech: 'Verb', forms: 'stem' }],
	['sexed', { stem: 'sex', part_of_speech: 'Verb', forms: 'past|perfect' }],
	['sexing', { stem: 'sex', part_of_speech: 'Verb', forms: 'participle' }],
	['sexes', { stem: 'sex', part_of_speech: 'Verb', forms: 'present' }],
])
