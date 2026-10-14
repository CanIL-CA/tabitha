import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
	PUBLIC_SOURCES_API_HOST: { public: true, static: true },
})
