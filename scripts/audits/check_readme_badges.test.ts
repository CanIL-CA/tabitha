import { describe, expect, it } from 'bun:test'
import {
	audit_and_sync_badge_content,
	extract_expected_badge_versions,
	sync_readme_badges,
	type BadgeVersionInfo,
} from './check_readme_badges'

describe('README Badge Synchronization & Verification', () => {
	const mock_versions: BadgeVersionInfo = {
		bun: '1.4',
		svelte: '5',
		tailwind: 'v4',
		daisyui: '5',
	}

	const sample_valid_readme = `# TaBiThA Monorepo

<p align="left">
  <a href="https://github.com/CanIL-CA/tabitha/actions/workflows/ci.yml"><img src="https://github.com/CanIL-CA/tabitha/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="https://svelte.dev"><img src="https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte&logoColor=white" alt="Svelte 5" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" /></a>
  <a href="https://daisyui.com"><img src="https://img.shields.io/badge/daisyUI-5-570DF8?style=flat-square&logo=daisyui&logoColor=white" alt="daisyUI 5" /></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Workers_%E2%80%A2_D1_%E2%80%A2_R2-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers • D1 • R2" /></a>
  <a href="https://turbo.build/repo"><img src="https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=flat-square&logo=turborepo&logoColor=white" alt="Turborepo" /></a>
  <a href="https://bun.com"><img src="https://img.shields.io/badge/Bun-1.4-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-Unit_Tests-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" /></a>
  <a href="https://playwright.dev"><img src="https://img.shields.io/badge/Playwright-E2E-2EAD33?style=flat-square&logo=playwright&logoColor=white" alt="Playwright" /></a>
  <a href="AGENTS.md"><img src="https://img.shields.io/badge/Code_Style-12_Philosophies-blueviolet?style=flat-square" alt="12 Philosophies" /></a>
</p>
`

	describe('audit_and_sync_badge_content', () => {
		it('reports clean sync for valid README content', () => {
			const result = audit_and_sync_badge_content({
				content: sample_valid_readme,
				expected_versions: mock_versions,
			})
			expect(result.is_synced).toBe(true)
			expect(result.findings.length).toBe(0)
			expect(result.updated_content).toBe(sample_valid_readme)
		})

		it('detects outdated Bun badge version and corrects it', () => {
			const outdated_readme = sample_valid_readme.replace('Bun-1.4', 'Bun-1.2')
			const result = audit_and_sync_badge_content({
				content: outdated_readme,
				expected_versions: mock_versions,
			})
			expect(result.is_synced).toBe(false)
			expect(result.findings.length).toBe(1)
			expect(result.findings[0].badge_name).toBe('Bun')
			expect(result.findings[0].current).toBe('1.2')
			expect(result.findings[0].expected).toBe('1.4')
			expect(result.updated_content).toContain('Bun-1.4-000000')
		})

		it('detects outdated Svelte badge version and corrects it', () => {
			const outdated_readme = sample_valid_readme.replace('Svelte-5', 'Svelte-4')
			const result = audit_and_sync_badge_content({
				content: outdated_readme,
				expected_versions: mock_versions,
			})
			expect(result.is_synced).toBe(false)
			expect(result.findings.some(f => f.badge_name === 'Svelte')).toBe(true)
			expect(result.updated_content).toContain('Svelte-5-FF3E00')
		})

		it('detects outdated Tailwind and daisyUI versions and corrects both', () => {
			const outdated_readme = sample_valid_readme
				.replace('Tailwind_CSS-v4', 'Tailwind_CSS-v3')
				.replace('daisyUI-5', 'daisyUI-4')

			const result = audit_and_sync_badge_content({
				content: outdated_readme,
				expected_versions: mock_versions,
			})
			expect(result.is_synced).toBe(false)
			expect(result.findings.length).toBe(2)
			expect(result.updated_content).toContain('Tailwind_CSS-v4-06B6D4')
			expect(result.updated_content).toContain('daisyUI-5-570DF8')
		})

		it('detects and updates old Cloudflare badge without R2', () => {
			const old_cf_readme = sample_valid_readme.replace(
				'Cloudflare-Workers_%E2%80%A2_D1_%E2%80%A2_R2-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers • D1 • R2"',
				'Cloudflare-Workers_%26_D1-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers & D1"',
			)

			const result = audit_and_sync_badge_content({
				content: old_cf_readme,
				expected_versions: mock_versions,
			})
			expect(result.is_synced).toBe(false)
			expect(result.findings.some(f => f.badge_name === 'Cloudflare')).toBe(true)
			expect(result.updated_content).toContain('Cloudflare-Workers_%E2%80%A2_D1_%E2%80%A2_R2-F38020')
			expect(result.updated_content).toContain('alt="Cloudflare Workers • D1 • R2"')
		})
	})

	describe('extract_expected_badge_versions', () => {
		it('extracts valid non-empty versions from live workspace package.json files', async () => {
			const versions = await extract_expected_badge_versions()
			expect(versions.bun.length).toBeGreaterThan(0)
			expect(versions.svelte).toBe('5')
			expect(versions.tailwind).toBe('v4')
			expect(versions.daisyui).toBe('5')
		})
	})

	describe('Live Workspace Synchronization', () => {
		it('verifies or auto-syncs live README.md', async () => {
			await sync_readme_badges({ should_write: true })
			const verify_result = await sync_readme_badges({ should_write: false })
			expect(verify_result.is_synced).toBe(true)
			expect(verify_result.findings.length).toBe(0)
		})
	})
})
