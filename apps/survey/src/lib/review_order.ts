/** The order one reviewer sees the items in. A fixed order leaves the last items unanswered once
 * reviewers stop partway, so each reviewer gets their own, seeded by their id so it stays put
 * across reloads. */
export function review_order<Item extends { key: string }>({ items, reviewer_id }: { items: Item[], reviewer_id: string }): Item[] {
	const ranked = items.map(item => ({ item, rank: mixed_hash(`${reviewer_id}:${item.key}`) }))
	return ranked.sort((left, right) => left.rank - right.rank || left.item.key.localeCompare(right.item.key)).map(ranked_item => ranked_item.item)
}

/** FNV-1a, then murmur3's finalizer, without which keys differing only in their last character
 * stay next to each other. */
function mixed_hash(text: string): number {
	let hash = 0x811c9dc5
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	hash ^= hash >>> 16
	hash = Math.imul(hash, 0x85ebca6b)
	hash ^= hash >>> 13
	hash = Math.imul(hash, 0xc2b2ae35)
	hash ^= hash >>> 16
	return hash >>> 0
}
