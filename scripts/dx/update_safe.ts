import { $ } from 'bun'
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sync_readme_badges } from '../audits/check_readme_badges'
import { scan_missing_bin_deps } from '../audits/check_missing_bin_deps'

const script_dir = fileURLToPath(new URL('.', import.meta.url))
const root_dir = resolve(script_dir, '../..')
const apps_dir = join(root_dir, 'apps')

function get_today_iso_date(): string {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

async function audit_and_update_cloudflare_compat_dates() {
	console.log('☁️  Checking Cloudflare Workers compatibility dates...')
	const today_date = get_today_iso_date()
	const app_entries = await readdir(apps_dir, { withFileTypes: true })
	const app_dirs = app_entries.filter(d => d.isDirectory()).map(d => d.name)

	let updated_count = 0

	for (const app_name of app_dirs) {
		const wrangler_path = join(apps_dir, app_name, 'wrangler.jsonc')
		if (!existsSync(wrangler_path)) continue

		const content = await readFile(wrangler_path, 'utf-8')
		const date_match = content.match(/"compatibility_date":\s*"(\d{4}-\d{2}-\d{2})"/)

		if (!date_match) continue

		const current_date = date_match[1]
		if (current_date < today_date) {
			const updated_content = content.replace(
				`"compatibility_date": "${current_date}"`,
				`"compatibility_date": "${today_date}"`,
			)
			await writeFile(wrangler_path, updated_content, 'utf-8')
			console.log(`   ✨ ${app_name}: Advanced compatibility_date from ${current_date} -> ${today_date}`)
			updated_count++
		} else {
			console.log(`   ✓ ${app_name}: compatibility_date is up to date (${current_date})`)
		}
	}

	if (updated_count > 0) {
		console.log(`   🎉 Updated compatibility_date across ${updated_count} Cloudflare Worker config(s).\n`)
	} else {
		console.log('   ✓ All Cloudflare compatibility dates are current.\n')
	}
}

async function audit_workspace_skills() {
	console.log('🧠 Auditing workspace AI skills (.claude/skills)...')
	const skills_dir = resolve(root_dir, '.claude/skills')
	if (!existsSync(skills_dir)) return

	const entries = await readdir(skills_dir, { withFileTypes: true })
	const skill_names = entries.filter(e => e.isDirectory()).map(e => e.name)
	console.log(`   ✓ Active skills (${skill_names.length}): ${skill_names.join(', ')}\n`)
}

async function sync_ci_node_version() {
	console.log('🤖 Synchronizing CI Node.js version with local runtime...')
	try {
		const node_proc = (await $`node -v`.text()).trim()
		const major = node_proc.replace(/^v/, '').split('.')[0]
		const node_version_path = join(root_dir, '.node-version')
		const current_pin = existsSync(node_version_path)
			? (await readFile(node_version_path, 'utf-8')).trim()
			: null

		if (current_pin !== major) {
			await writeFile(node_version_path, `${major}\n`, 'utf-8')
			console.log(`   ✨ Aligned CI Node.js version: ${current_pin ?? '(none)'} -> ${major}\n`)
		} else {
			console.log(`   ✓ CI Node.js version is in sync (${major})\n`)
		}
	} catch (err) {
		console.warn('   ⚠️  Could not sync CI Node version:', err instanceof Error ? err.message : err)
	}
}

async function sync_ci_bun_version() {
	console.log('🍞 Synchronizing CI Bun version with local runtime...')
	try {
		const bun_ver = (await $`bun --version`.text()).trim()
		const bun_version_path = join(root_dir, '.bun-version')
		const current_pin = existsSync(bun_version_path)
			? (await readFile(bun_version_path, 'utf-8')).trim()
			: null

		if (current_pin !== bun_ver) {
			await writeFile(bun_version_path, `${bun_ver}\n`, 'utf-8')
			console.log(`   ✨ Aligned CI Bun version: ${current_pin ?? '(none)'} -> ${bun_ver}\n`)
		} else {
			console.log(`   ✓ CI Bun version is in sync (${bun_ver})\n`)
		}
	} catch (err) {
		console.warn('   ⚠️  Could not sync CI Bun version:', err instanceof Error ? err.message : err)
	}
}

async function regenerate_worker_and_framework_types() {
	console.log('🔄 Regenerating SvelteKit & Cloudflare Worker type artifacts...')
	try {
		await $`cd apps/ontology && bunx wrangler types ./worker-configuration.d.ts`.quiet()
		console.log('   ✓ Regenerated Cloudflare Worker types for ontology.\n')
	} catch (err) {
		console.warn('   ⚠️  Could not regenerate wrangler types:', err instanceof Error ? err.message : err)
	}
}

async function run_safe_update() {
	console.log(`
============================================================
      📦 TaBiThA Safe Dependency & Maintenance Updater      
============================================================
`)

	// 1. Tooling & Engine Audit
	console.log('🔍 Auditing toolchain versions...')
	try {
		const node_ver = (await $`node -v`.text()).trim()
		const bun_ver = (await $`bun --version`.text()).trim()

		console.log(`   • Node.js:  ${node_ver}`)
		console.log(`   • Bun:      v${bun_ver}\n`)
	} catch (err) {
		console.warn('   ⚠️  Could not determine toolchain versions:', err instanceof Error ? err.message : err)
	}

	// 2. Workspace Skills Audit
	await audit_workspace_skills()

	// 3. Cloudflare Compatibility Date Maintenance
	await audit_and_update_cloudflare_compat_dates()

	// 4. CI Workflow & Toolchain Version Alignment
	await sync_ci_node_version()
	await sync_ci_bun_version()

	// 5. Non-Breaking SemVer Dependency Update
	console.log('📦 Updating workspace dependencies within declared SemVer ranges (non-breaking)...')
	try {
		await $`bun update --recursive`
		console.log('✅ Workspace dependencies safely updated!\n')
	} catch (err) {
		console.error('❌ Dependency update encountered an error:', err instanceof Error ? err.message : err)
		process.exit(1)
	}

	// 6. Cross-Workspace Dependency Version Consistency
	// `bun update --recursive` above updates each workspace package independently within its
	// own declared semver range, so two packages can silently drift onto different majors of
	// the same dependency (each staying "up to date" by its own range) with nothing to catch
	// it. Syncpack checks that every workspace agrees on one version per dependency.
	console.log('🔗 Checking cross-workspace dependency version consistency (syncpack)...')
	try {
		await $`bunx syncpack lint`
		console.log('   ✓ All workspace packages agree on dependency versions.\n')
	} catch {
		console.warn('   ⚠️  Found cross-workspace version drift -- run "bun run deps:fix" to align it.\n')
	}

	// 7. Regenerate Worker & Framework Types
	await regenerate_worker_and_framework_types()

	// 8. Synchronize README.md Badges with package.json
	console.log('🏷️  Synchronizing README.md badges with package.json versions...')
	try {
		const badge_res = await sync_readme_badges({ base_dir: root_dir, should_write: true })
		if (badge_res.is_synced) {
			console.log('   ✓ README badges are already in sync.\n')
		} else {
			console.log(`   ✨ Updated ${badge_res.findings.length} badge(s) in README.md.\n`)
		}
	} catch (err) {
		console.warn('   ⚠️  Could not synchronize README badges:', err instanceof Error ? err.message : err)
	}

	// 9. Full-Repo Undeclared CLI Dependency Sweep
	// CI's `check:deps` step only scans packages touched by a given diff, so it never nags a
	// dev about an unrelated package -- but that also means an existing gap (like a package
	// that already shells out to a CLI it never declared) can sit undetected until someone
	// happens to touch that package. This unscoped sweep runs the same check across every
	// workspace package to catch that class of drift on a maintenance cadence instead.
	console.log('🔧 Sweeping the full workspace for undeclared CLI dependencies...')
	try {
		const { scanned, findings } = await scan_missing_bin_deps({ all: true })
		if (findings.length === 0) {
			console.log(`   ✓ All ${scanned.length} workspace package(s) declare every CLI they shell out to.\n`)
		} else {
			console.warn(`   ⚠️  Found ${findings.length} undeclared CLI dependenc(y/ies) -- run "bun run check:deps -- --all" for details.\n`)
		}
	} catch (err) {
		console.warn('   ⚠️  Could not complete the undeclared CLI dependency sweep:', err instanceof Error ? err.message : err)
	}

	// 10. Automated Post-Update Health Verification Gate
	console.log('🧪 Running post-update verification gate...')

	console.log('   1/4 Running workspace static analysis & typecheck (bun run check)...')
	try {
		await $`bun run check`
		console.log('   ✓ Static analysis & typecheck passed cleanly!')
	} catch (err) {
		console.error('❌ Post-update check failed:', err instanceof Error ? err.message : err)
		process.exit(1)
	}

	console.log('   2/4 Running unit test suites (bun run test:unit)...')
	try {
		await $`bun run test:unit`
		console.log('   ✓ All unit test suites passed!')
	} catch (err) {
		console.error('❌ Post-update unit tests failed:', err instanceof Error ? err.message : err)
		process.exit(1)
	}

	console.log('   3/4 Verifying production Cloudflare Worker bundles (bun run build)...')
	try {
		await $`bun run build`
		console.log('   ✓ All Cloudflare Worker bundles built successfully!')
	} catch (err) {
		console.error('❌ Post-update production build failed:', err instanceof Error ? err.message : err)
		process.exit(1)
	}

	// Runs after (not alongside) the check above: build and build:ci both write to the same
	// per-app .svelte-kit/output, dist/, and build/ directories (see turbo.json), so running
	// them concurrently would race on the same files instead of actually saving time.
	console.log('   4/4 Verifying CI production build path (bun run build:ci, Bun runtime)...')
	try {
		await $`bun run build:ci`
		console.log('   ✓ All Cloudflare Worker bundles built successfully via the CI (Bun) path!')
	} catch (err) {
		console.error('❌ Post-update CI build path failed:', err instanceof Error ? err.message : err)
		process.exit(1)
	}

	console.log(`
============================================================
🎉 Safe Update Complete & 100% Verified!

All dependencies have been safely advanced within their
SemVer minor/patch boundaries, and all tests and builds passed.

To commit the updates:
  git add bun.lock package.json apps/ packages/ tools/
  git commit -m "chore(deps): safe dependency update"
============================================================
`)
}

if (import.meta.main) {
	await run_safe_update()
}
