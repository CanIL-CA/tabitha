import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
	PUBLIC_CORS_ALLOW_LOCALHOST: { public: true, static: true },
	PUBLIC_EDITOR_API_HOST: { public: true, static: true },
	PUBLIC_ONTOLOGY_API_HOST: { public: true, static: true },
	PUBLIC_RATE_LIMIT_DISABLED: { public: true, static: true },
	PUBLIC_SERVICE_BINDINGS_DISABLED: { public: true, static: true },
	PUBLIC_TARGETS_API_HOST: { public: true, static: true },
	BETTER_AUTH_SECRET: { static: true },
	GOOGLE_OAUTH_CLIENT_ID: { static: true },
	GOOGLE_OAUTH_CLIENT_SECRET: { static: true },
	OAUTH_REDIRECT_PROXY_URL: { static: true },
	AUTH_COOKIE_DOMAIN: { static: true },
})
