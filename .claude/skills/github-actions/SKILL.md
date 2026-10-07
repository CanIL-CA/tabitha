---
name: github-actions
description: GitHub Actions workflow skill for TaBiThA. TRIGGER when writing, inspecting, debugging, or reviewing anything under .github/workflows/ or .github/actions/, including token and permissions choices, PR-comment steps, advisory CI checks, and a 403 from a workflow step.
---

# GitHub Actions in TaBiThA

`ci.yml` runs on every push to `main` and every PR. `db_backup.yml` and `d1_cleanup.yml` are scheduled. Shared setup lives in the `./.github/actions/setup-workspace` composite action. `bun run check:github-actions` (`scripts/audits/check_github_actions.ts`) audits the token and permissions rules below.

## Tokens: `GITHUB_TOKEN` with job-level permissions first

Use the built-in `GITHUB_TOKEN` and grant exactly what a job needs. Don't reach for a PAT or a GitHub App token first.

- Every workflow declares a top-level `permissions:` block, normally just `contents: read`.
- A job that needs more declares its own `permissions:`. A job-level block **replaces** the top-level one rather than adding to it, so restate `contents: read` if the job also checks out code.
- Commenting on a PR needs `pull-requests: write`. `actions/github-script` uses `GITHUB_TOKEN` by default, so omit `github-token:`.
- The org's "Workflow permissions: read" setting (in both `presciencelabs` and `CanIL-CA`) is only the **default** for workflows that don't declare permissions. A `permissions:` key can raise it.

A PAT or App token is only justified for what `GITHUB_TOKEN` can't do:

- Reaching another repository.
- Triggering another workflow run (events caused by `GITHUB_TOKEN` don't start new runs, apart from `workflow_dispatch` and `repository_dispatch`).

PRs from forks and Dependabot get a read-only token no matter what you grant, and a PAT doesn't help there either, since those runs don't receive Actions secrets.

**A 403 is a hypothesis, not a diagnosis.** Before concluding that "org policy" blocks something, check the workflow's own `permissions:` blocks and try granting the scope at the job level. `PR_SUMMARY_TOKEN` existed for two weeks because a 403 caused by this workflow's own `contents: read` was blamed on org policy (fixed in PR #169).

## Advisory checks hide failures by design

Advisory steps use `continue-on-error: true`, and the PR-comment scripts wrap their API calls in `try`/`catch` with `core.warning`. Either way, a failing step can still show a green check. To verify that a change works, look at the outcome itself: the comment exists, its author is `github-actions[bot]`, and the step's real `outcome` is `success`.

## Adding an advisory audit

Audits are listed once, in `scripts/audits/registry.ts`. `bun run check:audits` runs that list locally, and `ci.yml`'s `security_compliance` job runs the same command, so the two can't drift.

1. Add a `bun run check:<name>` script to `package.json`.
2. Add an entry to `AUDITS` in `scripts/audits/registry.ts` with a label and `blocking: false` (only `check:secrets` and `check:deps` block today).

That's all. `pr_summary` builds its advisory table from the runner's JSON output, and `scripts/audits/run.test.ts` fails if a `scripts/audits/check_*` script is left out of the registry or if `ci.yml` runs an audit as its own step.

## Repo conventions

- Pin actions at the major versions already used: `actions/checkout@v7`, `actions/github-script@v9`, `oven-sh/setup-bun@v2`.
- Non-sensitive config goes in repository variables (`vars.*`), and only real credentials go in secrets (see AGENTS.md, "Reserve Secret Storage for Genuinely Sensitive Values").
- Production deploys happen in Cloudflare Workers Builds, not in Actions. CI only deploys per-PR Worker Previews (`preview_deploy` in `ci.yml`) and deletes them when the PR closes (`preview_cleanup.yml`); see ADR 0020.
