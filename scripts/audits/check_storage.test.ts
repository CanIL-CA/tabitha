import { describe, expect, it } from 'bun:test'
import { analyze_file_storage_rules, scan_storage_hygiene } from './check_storage'

describe('Storage & Cookie Security Checker', () => {
	describe('Rule: No Direct document.cookie', () => {
		it('detects direct document.cookie assignments', () => {
			const code = `
				function set_session() {
					document.cookie = 'user=test; path=/'
				}
			`
			const findings = analyze_file_storage_rules({ file_path: '/apps/test/test.ts', content: code })
			expect(findings.length).toBe(1)
			expect(findings[0].rule_name).toBe('No Direct document.cookie')
			expect(findings[0].severity).toBe('error')
		})

		it('detects direct document.cookie reads', () => {
			const code = `
				const cookies = document.cookie
			`
			const findings = analyze_file_storage_rules({ file_path: '/apps/test/test.ts', content: code })
			expect(findings.length).toBe(1)
			expect(findings[0].rule_name).toBe('No Direct document.cookie')
		})
	})

	describe('Rule: No Sensitive Storage Keys', () => {
		it('flags sensitive keys in localStorage.setItem', () => {
			const code = `
				localStorage.setItem('auth_token', token)
			`
			const findings = analyze_file_storage_rules({ file_path: '/apps/test/test.ts', content: code })
			expect(findings.length).toBe(1)
			expect(findings[0].rule_name).toBe('No Sensitive Storage Keys')
			expect(findings[0].snippet).toContain('auth_token')
		})

		it('flags sensitive keys in sessionStorage.setItem', () => {
			const code = `
				sessionStorage.setItem('user_session_id', id)
			`
			const findings = analyze_file_storage_rules({ file_path: '/apps/test/test.ts', content: code })
			expect(findings.length).toBe(1)
			expect(findings[0].rule_name).toBe('No Sensitive Storage Keys')
		})

		it('flags sensitive keys in persisted stores', () => {
			const code = `
				let user = persisted('user_jwt_token', {})
			`
			const findings = analyze_file_storage_rules({ file_path: '/apps/test/test.ts', content: code })
			expect(findings.length).toBe(1)
			expect(findings[0].rule_name).toBe('No Sensitive Storage Keys')
		})

		it('allows non-sensitive UI settings in localStorage', () => {
			const code = `
				localStorage.setItem('tabitha-theme', 'dracula')
				localStorage.setItem('search_scope', 'stems')
				localStorage.setItem('source_view_settings', JSON.stringify({ show_hover_popups: true }))
			`
			const findings = analyze_file_storage_rules({ file_path: '/apps/test/test.ts', content: code })
			expect(findings.length).toBe(0)
		})
	})

	describe('Rule: Enforce HttpOnly Cookies on Server', () => {
		it('detects explicit httpOnly: false', () => {
			const code = `
				cookies.set('session', id, { httpOnly: false, path: '/' })
			`
			const findings = analyze_file_storage_rules({ file_path: '/apps/test/+server.ts', content: code })
			expect(findings.length).toBe(1)
			expect(findings[0].rule_name).toBe('Enforce HttpOnly Cookies')
		})
	})

	describe('Full Workspace Scan', () => {
		it('passes cleanly across all workspace apps and packages', async () => {
			const result = await scan_storage_hygiene()
			expect(result.errors.length).toBe(0)
			expect(result.warnings.length).toBe(0)
			expect(result.scanned).toBeGreaterThan(0)
		})
	})
})
