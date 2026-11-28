import { createAuthClient } from 'better-auth/svelte'

// https://www.better-auth.com/docs/integrations/svelte-kit
export const auth_client = createAuthClient({ basePath: '/auth' })
