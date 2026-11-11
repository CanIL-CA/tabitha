// @ts-check

/**
 * Paraglide compiler options shared by every i18n-enabled app, used both by the Vite plugin
 * (`create_app_vite_config({ i18n: true })`) and by `tabitha-compile-messages` (an app's
 * `check` script, so svelte-check sees the generated modules) so the two never drift.
 *
 * The locale comes from the browser -- Accept-Language during SSR, navigator.languages on the
 * client -- so URLs stay unprefixed and there's no cookie or language switcher.
 *
 * @type {Pick<import('@inlang/paraglide-js').CompilerOptions, 'project' | 'outdir' | 'strategy' | 'emitReadme' | 'outputStructure'>}
 */
export const PARAGLIDE_OPTIONS = {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	strategy: ['preferredLanguage', 'baseLocale'],
	emitReadme: false,
	outputStructure: 'message-modules',
}
