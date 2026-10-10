---
name: turborepo
description: Turborepo skill for TaBiThA. TRIGGER when inspecting, creating, or modifying turbo.json, task pipelines, task inputs/outputs or caching, or when running or debugging `turbo` commands.
---

# Turborepo in TaBiThA

Turborepo's configuration, task behavior, and CLI commands change between versions and may differ from your training data. Read the docs bundled with the installed package instead of relying on memory.

## Read the installed docs first

`turbo` is a root devDependency, so its package is at `node_modules/turbo`. These docs match the installed version and need no network access.

1. Read `node_modules/turbo/docs/README.md`. Its table maps common tasks to the page to read.
2. Read the relevant page under `node_modules/turbo/docs/` before changing `turbo.json` or a `turbo` command. Site-absolute links such as `/docs/reference/run` map to files such as `reference/run.mdx`.
3. Follow any deprecation notices.

`node_modules/turbo/schema.json` lists every `turbo.json` field with a description.

## Repo notes

- `"agentGuidance": false` in `turbo.json` is deliberate. Turbo would otherwise insert a managed block into `AGENTS.md` that fails markdownlint (MD025). This skill replaces it.
- A task's cache key covers only its `inputs`. If you change a shared config package (such as `packages/vite-config`) and the result looks stale, check that the task's `inputs` include it, and rerun with `--force` to confirm.
