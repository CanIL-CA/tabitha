import { defineEnvVars } from '@sveltejs/kit/env'

// Read when the app starts. Unset is allowed and reads as '', so a missing secret fails the one
// feature that needs it rather than the whole app.
const optional = (value: string | undefined) => value ?? ''

export const variables = defineEnvVars({
	PUBLIC_CORS_ALLOW_LOCALHOST: { public: true, static: true },
	PUBLIC_ONTOLOGY_API_HOST: { public: true, static: true },
	PUBLIC_RATE_LIMIT_DISABLED: { public: true, static: true },
	PUBLIC_SERVICE_BINDINGS_DISABLED: { public: true, static: true },
	PUBLIC_TARGETS_API_HOST: { public: true, static: true },
	AI_GATEWAY_TOKEN: { schema: optional },
	CLOUDFLARE_ACCOUNT_ID: { schema: optional },
	GEMINI_LOCATION: { schema: optional },
	GEMINI_PROJECT_ID: { schema: optional },
})
