import { get_all_book_statuses } from '#lib/data/status.js'
import { testament_groupings } from '#lib/data/lookups.js'
import { BIBLE_BOOKS } from '@tabitha/types/patterns'
import type { PageServerLoad } from './$types'

export async function load({ locals: { db }, params: { type } }: Parameters<PageServerLoad>[0]) {
	const statuses = await get_all_book_statuses({ db, type })

	const primary_id_to_order_map: Record<string, number> = Object.fromEntries(Object.entries(BIBLE_BOOKS).map(([i, name]) => [name, Number(i)]))

	const status_groups = Object.entries(testament_groupings).map(([group_name, range]) => {
		const [start, end] = range
		const group_statuses = statuses.filter(({ reference: { id_primary } }) => {
			const order = primary_id_to_order_map[id_primary]
			return order >= start && order <= end
		}).toSorted((a, b) => primary_id_to_order_map[a.reference.id_primary] - primary_id_to_order_map[b.reference.id_primary])
		return {
			group_name,
			statuses: group_statuses,
		}
	})

	return {
		status_groups,
	}
}
