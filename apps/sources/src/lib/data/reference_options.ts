import { create_sources_client } from '@tabitha/api-client'
import type { PrimaryIdReference, SecondaryIdReference } from '@tabitha/types'
import { primary_id_groupings, primary_id_orders } from '#lib/data/lookups.js'
import type { PrimaryIdGroup } from '#lib/types.js'

const sources_client = create_sources_client({ base_url: '/' })

function sort_numerically(ids: string[]): string[] {
	return ids.toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export function fetch_types(): Promise<string[]> {
	return sources_client.get_types()
}

export function fetch_primary_ids(type: string): Promise<string[]> {
	return sources_client.get_primary_ids(type)
}

/** Primary ids already in display order, split into the type's named groups; ids outside every group (or all of them, for a type with no groups) stay ungrouped. */
export function group_primary_ids({ type, ids }: { type: string, ids: string[] }): PrimaryIdGroup[] {
	const position_by_id = new Map(Object.entries(primary_id_orders[type] ?? {}).map(([position, id]) => [id.toUpperCase(), Number(position)]))
	function is_in_range({ id, range: [start, end] }: { id: string, range: [number, number] }): boolean {
		const position = position_by_id.get(id.toUpperCase())
		return position !== undefined && position >= start && position <= end
	}

	const named_groups = Object.entries(primary_id_groupings[type] ?? {}).map(([label, range]) => ({
		label,
		ids: ids.filter(id => is_in_range({ id, range })),
	}))
	const grouped_ids = new Set(named_groups.flatMap(group => group.ids))
	const ungrouped = { label: null, ids: ids.filter(id => !grouped_ids.has(id)) }

	return [...named_groups, ungrouped].filter(group => group.ids.length > 0)
}

export async function fetch_secondary_ids(ref: PrimaryIdReference): Promise<string[]> {
	return sort_numerically(await sources_client.get_secondary_ids(ref))
}

export async function fetch_tertiary_ids(ref: SecondaryIdReference): Promise<string[]> {
	return sort_numerically(await sources_client.get_tertiary_ids(ref))
}
