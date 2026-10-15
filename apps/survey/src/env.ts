import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
	PUBLIC_RATE_LIMIT_DISABLED: { public: true, static: true },
})
