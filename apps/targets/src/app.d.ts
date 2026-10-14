import type { D1DatabaseSession } from '@cloudflare/workers-types'

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// Set for every route under [project=valid_project]; left unset for routes outside it
			// (currently only the project-list root route, which doesn't read locals.db).
			db: D1DatabaseSession
		}
		// interface PageData {}
	}
}

export {}
