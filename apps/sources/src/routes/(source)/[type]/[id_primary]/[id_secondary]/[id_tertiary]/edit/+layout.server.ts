import { get_nav_data } from '#lib/data/navigation.js'
import { error } from '@sveltejs/kit'
import type { Reference } from '@tabitha/types'
import type { LayoutServerLoadEvent } from './$types'

export async function load({ locals: { db }, params: { type, id_primary, id_secondary, id_tertiary } }: LayoutServerLoadEvent) {
	const reference: Reference = { type, id_primary, id_secondary, id_tertiary }
	const nav_data = await get_nav_data({ db, reference })
	if (!nav_data) {
		error(404, 'Unknown source reference.')
	}
	return { nav_data }
}
