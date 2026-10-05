import { browser } from '$app/environment'

export function persisted<T extends object>({ key, defaultValue }: { key: string, defaultValue: T }) {
	let state = $state(defaultValue)

	// Use $effect.root for side effects outside a component's lifecycle
	$effect.root(() => {
		// Only access localStorage in the browser
		if (browser) {
			const storedValue = localStorage.getItem(key)
			if (storedValue) {
				try {
					// enforce the structure of the default value (needed for adding/removing properties of something like settings)
					const parsed_value = JSON.parse(storedValue)
					state = Object.fromEntries(Object.entries(defaultValue).map(([k, v]) => [k, parsed_value[k] || v])) as T
				} catch (e) {
					console.error('Error parsing localStorage value for', key, e)
				}
			} else {
				delete_old_keys_with_prefix(key.split('@')[0])
			}
		}

		// Effect to sync state changes back to localStorage
		$effect(() => {
			if (browser) {
				localStorage.setItem(key, JSON.stringify(state))
			}
		})
	})

	return {
		get value() { return state },
		set value(newValue: T) { state = newValue },
	}
}

function delete_old_keys_with_prefix(prefix: string) {
	const old_keys: string[] = []
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i)
		if (key?.startsWith(prefix)) {
			old_keys.push(key)
		}
	}
	for (const old_key of old_keys) {
		localStorage.removeItem(old_key)
	}
}