type SubmitKeyPress = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'>

// Ctrl-Enter or Cmd-Enter submits; plain Enter stays a newline
export function is_submit_shortcut({ key, ctrlKey, metaKey, altKey, shiftKey, isComposing }: SubmitKeyPress) {
	if (isComposing) return false
	if (key !== 'Enter') return false
	if (altKey || shiftKey) return false
	return ctrlKey || metaKey
}
