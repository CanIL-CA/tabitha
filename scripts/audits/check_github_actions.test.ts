import { describe, expect, it } from 'bun:test'
import { find_missing_top_level_permissions, find_secret_github_tokens } from './check_github_actions'

describe('GitHub Actions Token & Permissions Audit', () => {
	describe('Rule: Secret Used as GitHub Token', () => {
		it('flags a PAT passed as github-script\'s github-token', () => {
			const workflow = `
      - uses: actions/github-script@v9
        with:
          github-token: \${{ secrets.PR_SUMMARY_TOKEN }}
`
			const findings = find_secret_github_tokens({ file_path: 'ci.yml', content: workflow })
			expect(findings.length).toBe(1)
			expect(findings[0].line_number).toBe(4)
			expect(findings[0].message).toContain('secrets.PR_SUMMARY_TOKEN')
		})

		it('flags a PAT passed as checkout\'s token and as GH_TOKEN', () => {
			const workflow = `
        with:
          token: \${{ secrets.BOT_PAT }}
        env:
          GH_TOKEN: \${{ secrets.BOT_PAT }}
`
			expect(find_secret_github_tokens({ file_path: 'ci.yml', content: workflow }).length).toBe(2)
		})

		it('allows the built-in secrets.GITHUB_TOKEN', () => {
			const workflow = `
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`
			expect(find_secret_github_tokens({ file_path: 'ci.yml', content: workflow })).toEqual([])
		})

		it('ignores non-GitHub tokens such as Cloudflare API tokens', () => {
			const workflow = `
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN_PREVIEW_DEPLOY }}
`
			expect(find_secret_github_tokens({ file_path: 'ci.yml', content: workflow })).toEqual([])
		})

		it('ignores commented-out lines', () => {
			const workflow = `
          # github-token: \${{ secrets.PR_SUMMARY_TOKEN }}
`
			expect(find_secret_github_tokens({ file_path: 'ci.yml', content: workflow })).toEqual([])
		})
	})

	describe('Rule: Missing Top-Level Permissions', () => {
		it('flags a workflow without a top-level permissions block', () => {
			const workflow = `name: Backup
on: push
jobs:
  backup:
    permissions:
      contents: read
`
			const findings = find_missing_top_level_permissions({ file_path: 'backup.yml', content: workflow })
			expect(findings.length).toBe(1)
			expect(findings[0].rule_name).toBe('Missing Top-Level Permissions')
		})

		it('passes a workflow that declares top-level permissions', () => {
			const workflow = `name: CI
on: push
permissions:
  contents: read
jobs: {}
`
			expect(find_missing_top_level_permissions({ file_path: 'ci.yml', content: workflow })).toEqual([])
		})
	})
})
