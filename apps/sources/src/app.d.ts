import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { SourcesUser } from '#lib/types.js'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db: D1DatabaseSession
			db_auth: D1DatabaseSession
			user: SourcesUser | undefined
		}
		// interface PageData {}
	}
}

export {}
