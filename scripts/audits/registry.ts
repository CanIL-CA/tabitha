// Every repo-wide audit, run by `bun run check:audits` (scripts/audits/run.ts) both locally and in
// CI's security_compliance job, so the two can't drift. Each audit keeps its own `check:*` script
// in the root package.json for running it alone.
//
// A blocking audit fails the run (and CI's security_compliance gate). An advisory one is reported
// in the summary and the PR's advisory comment, but never fails the run.
export type Audit = {
	readonly script: string
	readonly label: string
	readonly blocking: boolean
}

export const AUDITS: readonly Audit[] = [
	{ script: 'check:secrets', label: 'Secret & Credential Leak Scan', blocking: true },
	{ script: 'check:deps', label: 'Undeclared CLI Dependency Audit', blocking: true },
	{ script: 'check:philosophies', label: 'Architectural Philosophies', blocking: false },
	{ script: 'check:cloudflare', label: 'Cloudflare Workers Config Audit', blocking: false },
	{ script: 'check:storage', label: 'Storage & Cookie Hygiene', blocking: false },
	{ script: 'check:badges', label: 'README Badge & Version Sync', blocking: false },
	{ script: 'check:philosophy-docs', label: 'Philosophy Count Doc Sync', blocking: false },
	{ script: 'check:md', label: 'Markdown Lint', blocking: false },
	{ script: 'check:package-boundaries', label: 'Relative Package Import Audit', blocking: false },
	{ script: 'check:a11y-names', label: 'Accessible-Name Collision Audit', blocking: false },
	{ script: 'check:noindex', label: 'Tool App noindex Audit', blocking: false },
	{ script: 'check:cross-platform', label: 'Cross-Platform DX Tooling Audit', blocking: false },
	{ script: 'check:github-actions', label: 'GitHub Actions Token & Permissions Audit', blocking: false },
]
