import { AI_GATEWAY_TOKEN, CLOUDFLARE_ACCOUNT_ID, GEMINI_LOCATION, GEMINI_PROJECT_ID } from '$app/env/private'
import { create_ai_client, type AiClient } from '@tabitha/ai'

export function create_editor_ai_client(): AiClient {
	return create_ai_client({
		app: 'editor',
		feature: 'ai-assist',
		gateway: {
			account_id: CLOUDFLARE_ACCOUNT_ID,
			token: AI_GATEWAY_TOKEN,
			project: GEMINI_PROJECT_ID,
			location: GEMINI_LOCATION,
		},
	})
}
