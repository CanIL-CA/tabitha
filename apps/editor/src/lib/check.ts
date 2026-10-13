import type { CheckerAutoFix, EditorCheckResult } from '@tabitha/types'
import { apply_text_insertions } from '#lib/text_insertions.js'
import { create_editor_client } from '@tabitha/api-client'

type CheckedText = {
	text: string
	result: EditorCheckResult
}

const editor_client = create_editor_client({ base_url: '/' })

async function fetch_check_result({ text, auto_fix }: { text: string; auto_fix: boolean }): Promise<EditorCheckResult> {
	return await editor_client.check_text({ text, auto_fix }) ?? { status: 'error', tokens: [], back_translation: '' }
}

export async function check_text(text: string): Promise<CheckedText> {
	const result = await fetch_check_result({ text, auto_fix: true })
	const fixed_text = apply_text_insertions({ text, insertions: result.auto_fixes ?? [] }).text

	return { text: fixed_text, result }
}

// Checks again without auto-fixes, so the removed fix goes back to being only a suggestion
export async function remove_auto_fix({ text, auto_fix }: { text: string; auto_fix: CheckerAutoFix }): Promise<CheckedText> {
	const is_fix_still_in_text = text.slice(auto_fix.start, auto_fix.end) === auto_fix.text
	const reverted_text = is_fix_still_in_text ? text.slice(0, auto_fix.start) + text.slice(auto_fix.end) : text
	const result = await fetch_check_result({ text: reverted_text, auto_fix: false })

	return { text: reverted_text, result }
}
