import type { ViewSettings } from '#lib/types.js'
const defaults: ViewSettings = {
	show_hover_popups: true,
	show_boundary_labels: true,
	show_feature_codes: false,
}
export const view_settings: ViewSettings = $state(defaults)

export function set_settings(new_settings: ViewSettings): void {
	view_settings.show_hover_popups = new_settings.show_hover_popups
	view_settings.show_boundary_labels = Boolean(new_settings.show_boundary_labels) // in case the saved settings don't have this field yet
	view_settings.show_feature_codes = Boolean(new_settings.show_feature_codes) // in case the saved settings don't have this field yet
}
