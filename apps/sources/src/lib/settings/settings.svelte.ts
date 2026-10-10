import type { ViewSettings } from '#lib/types.js'
const defaults: ViewSettings = {
	show_hover_popups: true,
}
export const view_settings: ViewSettings = $state(defaults)

export function set_settings(new_settings: ViewSettings): void {
	view_settings.show_hover_popups = new_settings.show_hover_popups
}
