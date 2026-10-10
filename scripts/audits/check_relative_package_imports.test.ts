import { describe, expect, it } from 'bun:test'
import { join, resolve } from 'node:path'
import { scan_file_for_boundary_violations } from './check_relative_package_imports'
import type { WorkspacePackage } from './check_missing_bin_deps'

// resolve() (not join()) so this is a fully-qualified path on every platform -- on win32, a
// driveless root like '/repo' resolves against cwd's drive when the scanner's own resolve(dir,
// specifier) call reaches it, while a plain join() never attaches one, so the two would silently
// stop matching (production's real WorkspacePackage.dir values are always resolve()-derived, via
// root_dir in check_missing_bin_deps.ts, so this mismatch was a test-fixture-only issue).
const root = resolve('/repo')
const scripts_pkg: WorkspacePackage = { name: 'scripts', dir: join(root, 'scripts'), package_json_path: join(root, 'scripts/package.json') }
const vite_config_pkg: WorkspacePackage = { name: 'packages/vite-config', dir: join(root, 'packages/vite-config'), package_json_path: join(root, 'packages/vite-config/package.json') }
const all_packages = [scripts_pkg, vite_config_pkg]
const package_names = new Map([
	[scripts_pkg.dir, '@tabitha/scripts'],
	[vite_config_pkg.dir, '@tabitha/vite-config'],
])

describe('Cross-Package Relative Import Checker', () => {
	it('flags a relative import that resolves into a different package', () => {
		const file_path = join(root, 'scripts/dx/gematria.ts')
		const content = "import { PORTS } from '../../packages/vite-config/ports.js'"

		const findings = scan_file_for_boundary_violations({ file_path, content, importing_pkg: scripts_pkg, importing_pkg_name: '@tabitha/scripts', all_packages, package_names })

		expect(findings.length).toBe(1)
		expect(findings[0].importing_package).toBe('@tabitha/scripts')
		expect(findings[0].target_package).toBe('@tabitha/vite-config')
		expect(findings[0].specifier).toBe('../../packages/vite-config/ports.js')
	})

	it('does not flag a relative import that stays within the importing file\'s own package', () => {
		const file_path = join(root, 'scripts/dx/doctor.ts')
		const content = "import { check_cloudflare_configs } from '../audits/check_cloudflare'"

		const findings = scan_file_for_boundary_violations({ file_path, content, importing_pkg: scripts_pkg, importing_pkg_name: '@tabitha/scripts', all_packages, package_names })

		expect(findings).toEqual([])
	})

	it('does not flag a same-directory sibling import', () => {
		const file_path = join(root, 'scripts/dx/doctor.ts')
		const content = "import { parse_wrangler_jsonc } from './db_load'"

		const findings = scan_file_for_boundary_violations({ file_path, content, importing_pkg: scripts_pkg, importing_pkg_name: '@tabitha/scripts', all_packages, package_names })

		expect(findings).toEqual([])
	})

	it('does not flag a relative import that resolves outside every known package', () => {
		const file_path = join(root, 'scripts/dx/doctor.ts')
		const content = "import { something } from '../../../outside-the-repo/foo'"

		const findings = scan_file_for_boundary_violations({ file_path, content, importing_pkg: scripts_pkg, importing_pkg_name: '@tabitha/scripts', all_packages, package_names })

		expect(findings).toEqual([])
	})

	it('reports the correct line number for a later match', () => {
		const file_path = join(root, 'scripts/dx/gematria.ts')
		const content = [
			'const x = 1',
			"import { PORTS } from '../../packages/vite-config/ports.js'",
		].join('\n')

		const findings = scan_file_for_boundary_violations({ file_path, content, importing_pkg: scripts_pkg, importing_pkg_name: '@tabitha/scripts', all_packages, package_names })

		expect(findings[0].line_number).toBe(2)
	})
})
