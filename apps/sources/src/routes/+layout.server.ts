import type { SourcesUser } from '#lib/types.js'
import type { LayoutServerLoadEvent } from './$types'

type LayoutData = {
	user: SourcesUser | undefined
}

export function load({ locals }: LayoutServerLoadEvent): LayoutData {
	return { user: locals.user }
}
