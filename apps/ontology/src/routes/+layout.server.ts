import { get_version } from '#lib/server/ontology.js'
import type { OntologyUser } from '#lib/types.js'
import type { LayoutServerLoadEvent } from './$types'

type LayoutData = {
	version: string
	user: OntologyUser | undefined
}

export async function load({ locals }: LayoutServerLoadEvent): Promise<LayoutData> {
	const version = await get_version(locals.db_ontology)

	return {
		version,
		user: locals.user,
	}
}
