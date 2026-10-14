import { defineParams } from '@sveltejs/kit/params'
import { TARGET_PROJECTS } from '@tabitha/types/target'

export function is_integer(param: string): boolean {
	return /^[0-9]+$/.test(param)
}

export function is_book_name(param: string): boolean {
	// covers numbered books, e.g., 1 Chronicles, 3 John
	return /^[a-zA-Z0-3 ]+$/.test(param)
}

export function is_target_project(param: string): boolean {
	return (TARGET_PROJECTS as readonly string[]).includes(param)
}

export const params = defineParams({
	integer: param => is_integer(param) ? param : undefined,
	valid_book: param => is_book_name(param) ? param : undefined,
	valid_project: param => is_target_project(param) ? param : undefined,
})
