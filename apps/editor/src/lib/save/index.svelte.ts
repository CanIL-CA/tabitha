import { browser } from '$app/env'
import SaveButton from './SaveButton.svelte'

class SaveState {
	value = $state(browser ? localStorage?.getItem('saved') || '' : '')

	set(new_value: string) {
		if (browser) {
			localStorage.setItem('saved', new_value)
		}
		this.value = new_value
	}
}

export const save_state = new SaveState()

export { SaveButton }
