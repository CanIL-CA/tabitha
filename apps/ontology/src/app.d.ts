/// <reference types="svelte" />
/// <reference types="vite-plugin-pwa/client" />
import type { Auth } from '@auth/sveltekit'
import type { D1Database } from '@cloudflare/workers-types'
import type { OntologyUser, SaveResult } from '$lib/types'

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db_ontology: D1Database
			db_auth: D1Database
			auth: Auth
			user: OntologyUser | undefined
		}
		interface PageState {
			save_result?: SaveResult
		}

		interface Platform {
			env: Env
		}
	}
}
