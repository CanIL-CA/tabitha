/// <reference types="svelte" />
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { OntologyUser, SaveResult } from '#lib/types.js'

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			db_ontology: D1DatabaseSession
			db_auth: D1DatabaseSession
			user: OntologyUser | undefined
		}
		interface PageState {
			save_result?: SaveResult
		}
	}
}
