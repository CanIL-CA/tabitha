import type { TargetFormResult, TargetFeatureResult, TargetTextResult, Reference, TargetTextData } from '@tabitha/types'
import { create_http_client, type ClientOptions } from './http'

export type TargetsClient = ReturnType<typeof create_targets_client>
export type TargetsClientOptions = ClientOptions

/**
 * Creates a typed HTTP client for communicating with the Targets service (`apps/targets`).
 *
 * @example
 * ```typescript
 * import { create_targets_client } from '@tabitha/api-client'
 *
 * const targets = create_targets_client({
 *   base_url: PUBLIC_TARGETS_API_HOST,
 *   cache: true, // Enables transparent Edge CDN caching on GET requests
 * })
 *
 * const ref = { type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' }
 * const text = await targets.get_target_text({ ref, project: 'English', preferred_audience: 'Unchurched Adults' })
 * const forms = await targets.lookup_forms({ word: 'loved', project: 'English' })
 * ```
 */
export function create_targets_client(options: TargetsClientOptions) {
	const http = create_http_client(options)

	return {
		/**
		 * Retrieve generated target translation text for a verse reference and audience.
		 */
		async get_target_text({ ref, project, preferred_audience }: { ref: Reference, project: string, preferred_audience?: string }): Promise<TargetTextData | null> {
			const result = await http.get<TargetTextResult>(`/${project}/${ref.id_primary}/${ref.id_secondary}/${ref.id_tertiary}`)
			if (!result) return null
			return result.texts.find(r => r.audience === preferred_audience)
					?? result.texts.find(r => r.text)
					?? null
		},

		/**
		 * Retrieve full source and lexical features for a target project.
		 */
		async lookup_features({ project, category }: { project: string, category?: string }): Promise<TargetFeatureResult | null> {
			const params = category ? `?${new URLSearchParams({ category }).toString()}` : ''
			return http.get<TargetFeatureResult>(`/${project}/lookup/features${params}`)
		},

		/**
		 * Search lexical forms and inflections for a word token in a target language project.
		 */
		async lookup_forms({ word, project }: { word: string, project: string }): Promise<TargetFormResult[]> {
			return await http.get<TargetFormResult[]>(`/${project}/lookup/forms?word=${encodeURIComponent(word)}`) ?? []
		},
	}
}
