# TaBiThA Monorepo

<p align="left">
  <a href="https://github.com/CanIL-CA/tabitha/actions/workflows/ci.yml"><img src="https://github.com/CanIL-CA/tabitha/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" /></a>
  <a href="https://svelte.dev"><img src="https://img.shields.io/badge/Svelte-5-FF3E00?style=flat-square&logo=svelte&logoColor=white" alt="Svelte 5" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" /></a>
  <a href="https://daisyui.com"><img src="https://img.shields.io/badge/daisyUI-5-570DF8?style=flat-square&logo=daisyui&logoColor=white" alt="daisyUI 5" /></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Workers_%E2%80%A2_D1_%E2%80%A2_R2-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers • D1 • R2" /></a>
  <a href="https://turbo.build/repo"><img src="https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=flat-square&logo=turborepo&logoColor=white" alt="Turborepo" /></a>
  <a href="https://bun.com"><img src="https://img.shields.io/badge/Bun-1.4-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-Unit_Tests-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" /></a>
  <a href="https://playwright.dev"><img src="https://img.shields.io/badge/Playwright-E2E-2EAD33?style=flat-square&logo=playwright&logoColor=white" alt="Playwright" /></a>
  <a href="AGENTS.md"><img src="https://img.shields.io/badge/Code_Style-15_Philosophies-blueviolet?style=flat-square" alt="15 Philosophies" /></a>
</p>

This repository houses all core deployable web applications, developer tools, shared libraries, and linguistic pipelines for the TaBiThA translation platform.

---

## 🏛️ About This Project

TaBiThA is [CanIL](https://www.canil.ca)'s research and innovation arm, building Bible translation software for languages that don't yet have a translation of their own. It's actively developed (see the CI badge above) and openly licensed under [MIT](LICENSE).

- **Decision history:** [`docs/decisions/`](docs/decisions/) — architecture decision records documenting the "why" behind notable technical choices.
- **Public site:** [tabitha.bible](https://tabitha.bible) — project background, FAQs, and point of contact.

---

## 🚀 Applications & Dedicated Ports

The web apps are built with **Svelte**, **SvelteKit**, **Tailwind CSS**, and **daisyUI**, deployed as Cloudflare Workers — each gets a dedicated, non-overlapping port for multi-app dev. `scheduler` is a plain, cron-only Worker with no UI or port.

| Application | Path | Local Dev URL | Dedicated Port | Production URL | Notes |
| --- | --- | --- | --- | --- | --- |
| **Ontology** | `apps/ontology` | `http://localhost:3056` | `3056` | [ontology.tabitha.bible](https://ontology.tabitha.bible) | `strictPort: true` for Google/GitHub OAuth callback configurations |
| **Targets** | `apps/targets` | `http://localhost:1382` | `1382` | [targets.tabitha.bible](https://targets.tabitha.bible) | Target language generation search and forms API |
| **Sources** | `apps/sources` | `http://localhost:1947` | `1947` | [sources.tabitha.bible](https://sources.tabitha.bible) | Source text analysis and semantic encoding explorer |
| **Editor** | `apps/editor` | `http://localhost:1337` | `1337` | [editor.tabitha.bible](https://editor.tabitha.bible) | Grammar & rule checker, backtranslator, AI assistant |
| **Copilot** | `apps/copilot` | `http://localhost:9000` | `9000` | [copilot.tabitha.bible](https://copilot.tabitha.bible) | Translation notes, brief extraction, and AI copilot |
| **www** | `apps/www` | `http://localhost:1455` | `1455` | [tabitha.bible](https://tabitha.bible) | Public-facing marketing/informational site |
| **Scheduler** | `apps/scheduler` | — (`bun run dev:scheduler`) | — | — (cron only, no public URL) | Triggers apps' scheduled work, e.g. ontology's complex terms and embeddings sync ([ADR 0018](docs/decisions/0018-scheduled-work-via-scheduler-worker.md)) |

---

## 🔗 Using the APIs

**Ontology**, **Sources**, **Targets**, and **Copilot** each expose a public, read-only HTTP API — no API key or authentication required. Endpoint-level documentation (routes, query params, examples) lives in each app's own README:

- [Ontology API](apps/ontology/README.md#-api) — concept search, simplification hints, usage examples
- [Sources API](apps/sources/README.md#-api) — source text navigation, semantic encoding, reference search
- [Targets API](apps/targets/README.md#-api) — target translation text, search, lexical/feature lookups
- [Copilot API](apps/copilot/README.md#-api) — translation notes and consultant briefs per verse

**Rate limits:** all four apps throttle to **60 requests per 60 seconds per client IP**. A request over the limit gets a `429` response with a `Retry-After: 60` header.

**Stability:** these APIs are built for TaBiThA's own internal UIs first. There's no versioning scheme or backwards-compatibility guarantee — routes and response shapes can change without notice. If you're integrating against one, expect to track changes here rather than relying on a stable contract.

---

## 🤖 For AI Coding Agents

This repo is set up to support work with AI coding agents, not just humans.

- **Canonical instructions:** [`AGENTS.md`](AGENTS.md) — the 15 Development Philosophies enforced across the codebase (see the table further down). Many agent tools auto-detect this filename; if yours doesn't, read it before making changes.
- **Narrower, task-scoped conventions:** [`.claude/skills/`](.claude/skills/) — per-library/domain guidance (Svelte, Tailwind CSS, Cloudflare Workers, SQLite, etc.) loaded contextually rather than kept in `AGENTS.md`. See [CONTRIBUTING.md](CONTRIBUTING.md) for when to add a new one.
- **Before calling a task done**, run the relevant commands from [Verification & Testing](#verification--testing) below — at minimum `bun run check` (typecheck + lint) and `bun run check:audits` (every repo audit, including the Development Philosophies and secrets scans; the same list CI runs).

---

## 📦 Monorepo Structure

```text
tabitha/
├── apps/
│   ├── copilot/     # AI Copilot & translation notes generator
│   ├── editor/      # Semantic editor, rule parser & backtranslator
│   ├── ontology/    # Central ontology database & concept management (Auth.js)
│   ├── scheduler/   # Cron-only Worker that triggers each app's scheduled work
│   ├── sources/     # Source entities, lookups, and feature explorer
│   ├── targets/     # Target grammar, project search, and lexicons
│   └── www/         # Public-facing marketing/informational site
├── packages/
│   ├── ai/             # Shared LLM plumbing: AI Gateway routing, retries, credentials (@tabitha/ai)
│   ├── api-client/     # Typed HTTP clients for calling one app's API from another (@tabitha/api-client)
│   ├── complex-terms/  # How-to sheet -> Complex_Terms rows, for sync and migration (@tabitha/complex-terms)
│   ├── cors/           # Shared CORS allowed-origin handling for app APIs (@tabitha/cors)
│   ├── eslint-config/  # Shared ESLint 9 configuration (@tabitha/eslint-config)
│   ├── noindex/        # X-Robots-Tag noindex handle for the tool and API apps (@tabitha/noindex)
│   ├── tsconfig/       # Base TypeScript configurations (@tabitha/tsconfig)
│   ├── types/          # Shared cross-app domain types (@tabitha/types)
│   ├── ui/             # Shared Svelte 5 / daisyUI components (@tabitha/ui)
│   └── vite-config/    # Shared Vite/Playwright/SvelteKit config helpers (@tabitha/vite-config)
├── scripts/         # Monorepo maintenance, DX tooling & CI audit scripts
│   ├── audits/      # Quality, philosophy, secret & storage linters (+ colocated tests)
│   ├── ci/          # CI test coverage reporting
│   └── dx/          # Setup wizard, doctor, dev server menu, D1 loaders & safe updater
├── tools/
│   └── databases/   # SQLite snapshots, ETL migration pipeline & reference datasets
├── docs/
│   └── decisions/   # Architecture decision records — the "why" behind notable technical choices
├── turbo.json
└── package.json
```

---

## 🛠️ Getting Started & Commands

### Prerequisites

- **Bun**
- **SQLite3 CLI** (`sqlite3`)
- **Node.js** (Windows only — see [CONTRIBUTING.md](CONTRIBUTING.md#1-prerequisites))

### Quick Start

```bash
# 1. Install all dependencies across workspace
bun install

# 2. Automated developer onboarding (environment scaffolding + DB loading + verification)
bun run setup

# 3. Run all dev servers in parallel
bun run dev
```

### Database & Environment Workflows

```bash
# Load all SQLite/D1 databases from snapshots into local Wrangler environments
bun run db:load

# Load database for a specific app
bun run db:load:ontology
bun run db:load:sources
bun run db:load:targets

# Inspect local D1 database tables, row counts, and snapshot status
bun run db:status

# Scaffold .env.local files from .env templates
bun run setup:env
```

### Running Specific Dev Servers

```bash
# Interactive app selector & preset menu
bun run dev:menu

# Or start a specific application directly
bun run dev:ontology   # http://localhost:3056
bun run dev:targets    # http://localhost:1382
bun run dev:sources    # http://localhost:1947
bun run dev:editor     # http://localhost:1337
bun run dev:copilot    # http://localhost:9000
bun run dev:www        # http://localhost:1455
bun run dev:scheduler  # cron-only Worker; see apps/scheduler/README.md
```

> **Windows:** avoid using the specific dev commands (eg. `dev:ontology`) -- always run through `dev` or `dev:menu` instead.

### 🧪 Local Smoke Test ("Golden Path")

To verify that all local applications, databases, and inter-app APIs are working together:

1. **Start all dev servers**: `bun run dev`
2. **Open the Editor**: [http://localhost:1337](http://localhost:1337)
3. **Type `Paul write-A a letter.` into the text box and click Check**:
   - *Verifies Editor (`:1337`)*: Parses tokens and, on clicking the `write-A` token, shows a popup with a clickable concept link.
4. **Click the `write-A` link in that popup**:
   - *Verifies Ontology (`:3056`)*: Navigates to [http://localhost:3056/?q=write-A](http://localhost:3056/?q=write-A) and loads definitions from the local D1 database.
5. **Expand any "Usage Example" accordion in Ontology**:
   - *Verifies Sources (`:1947`)*: Fetches and displays the semantic clause parse tree.
   - *Verifies Targets (`:1382`)*: Fetches and displays the generated English translation text.

### Verification & Testing

```bash
# Run typechecking (svelte-check) and linting across all apps
bun run check

# Run ESLint with auto-fix across all apps
bun run check:lint:fix

# Run full workspace environment and health diagnostics
bun run check:doctor

# Run every repo audit in scripts/audits/registry.ts (what CI runs), with a summary at the end
bun run check:audits

# Audit codebase compliance against Development Philosophies
bun run check:philosophies

# Scan codebase for exposed secrets and credentials
bun run check:secrets

# Validate Cloudflare Workers wrangler.jsonc configurations
bun run check:cloudflare

# Audit client storage hygiene and cookie security
bun run check:storage

# Audit for accessible-name collisions between persistent nav/chrome and page content
bun run check:a11y-names

# Audit GitHub Actions workflows for PATs used as GitHub tokens and missing permissions blocks
bun run check:github-actions

# Run Markdown linting across all documentation
bun run check:md

# Run unit test suites in parallel (Vitest)
bun run test:unit

# Build all applications for production (Cloudflare Workers)
bun run build

# Clean and re-install entire workspace
bun run clean:powerwash
```

### Dependency Maintenance & Upgrades

```bash
# Safely update dependencies within declared SemVer ranges, check Cloudflare compat dates, and run verification gate
bun run update:safe

# Interactively review and upgrade to latest major releases
bun run update:interactive
```

### Local CI/CD Workflow Testing (Optional)

To test GitHub Actions workflows in `.github/workflows/` locally, use [`act`](https://github.com/nektos/act) to run them in local Docker containers:

```bash
# Installation:
# macOS:   brew install act
# Windows: winget install nektos.act
# Linux:   https://github.com/nektos/act#installation

# List available workflow jobs:
act -l

# Run the CI verification job locally:
act -j verify

# Simulate a pull request event:
act pull_request
```

---

## 🧩 Architecture Overview

```mermaid
graph TD;
    subgraph "Users & Consumers"
        direction LR
        Phase1Analyst[Phase 1 Analyst];
        OutsideSystem(["💻 Outside System <br/>(API Consumer)"]);
        GrammarDeveloper[Grammar Developer];
    end

    subgraph Platform ["The Internet"]
        direction TB

        subgraph UILayer ["User Interface Layer"]
            direction LR
            OntologyUI["Ontology UI <br/>(:3056)"];
            EditorUI["Editor UI <br/>(:1337)"];
            CopilotUI["Copilot UI <br/>(:9000)"];
            SourcesUI["Sources UI <br/>(:1947)"];
            TargetsUI["Targets UI <br/>(:1382)"];
        end

        subgraph APILayer ["API & Services Layer"]
            direction LR
            OntologyAPI[Ontology API];
            EditorAPI[Editor API];
            SourcesAPI[Sources API];
            TargetsAPI[Targets API];
            CopilotAPI[Copilot API];
            Scheduler["Scheduler <br/>(cron only)"];
        end

        subgraph SharedPackages ["Shared Workspace Packages"]
            direction LR
            TypesPkg["@tabitha/types"];
            UIPkg["@tabitha/ui"];
            APIClientPkg["@tabitha/api-client"];
            AIPkg["@tabitha/ai"];
            ESLintPkg["@tabitha/eslint-config"];
            TSConfigPkg["@tabitha/tsconfig"];
        end

        subgraph DataLayer ["Data & Storage Layer"]
            direction LR
            OntologyDB[(Ontology D1/SQLite)];
            SourcesDB[(Sources D1/SQLite)];
            TargetsDB[(Targets D1/SQLite)];
            AuthDB[(Auth D1/SQLite)];
        end
    end

    subgraph ExternalServices ["External AI Services"]
        direction LR
        AIGateway["Cloudflare AI Gateway"];
        VertexAI["Google Vertex AI"];
    end

    Phase1Analyst --> OntologyUI;
    Phase1Analyst --> EditorUI;
    Phase1Analyst --> CopilotUI;
    OutsideSystem --> OntologyAPI;
    OutsideSystem --> SourcesAPI;
    OutsideSystem --> TargetsAPI;
    OutsideSystem --> CopilotAPI;

    OntologyUI --> OntologyAPI;
    EditorUI --> EditorAPI;
    SourcesUI --> SourcesAPI;
    TargetsUI --> TargetsAPI;
    CopilotUI --> CopilotAPI;

    UILayer -.-> SharedPackages;

    OntologyAPI --> OntologyDB;
    OntologyAPI --> AuthDB;
    SourcesAPI --> SourcesDB;
    TargetsAPI --> TargetsDB;

    Scheduler -.->|"service binding, every 12h"| OntologyAPI;

    OntologyAPI --> AIGateway;
    CopilotAPI --> AIGateway;
    AIGateway --> VertexAI;
```

---

## 📖 TBTA Linguistic Basics

### What Does TBTA Do?

#### 1. Source Text (Mark 1:2 NIV)

> *"as it is written in Isaiah the prophet: 'I will send my messenger ahead of you, who will prepare your way'"*

#### 2. Phase 1 Encoded Form

> *Isaiah [who told God's messages to people] wrote, ["You(Christ) (imp) listen to me(God)]. I(God) (primary) will send my(God's) person [who takes messages to people] [before I(God) send you(Christ)]. I(God) (meaning-1) will send my(God's) person [who takes messages to people] in-front-of you(Christ). (literal) And that person/messenger will prepare-B your(Christ's) path." (dynamic) And that person/messenger will say/announce [you(Christ) are coming]."*

#### 3. Simplified Semantic Form

```text
[C [NP Isaiah(N) [C [NP Isaiah(N) ] [VP tell-D(V) ] [NP message(N) [NP -Generic Genitive(Adp) God(N) ] ] [NP person(N) ] ] ] [VP write-C(V) ] [C -QuoteBegin(Par) [NP Christ(N) ] [VP listen(V) ] [NP God(N) ] ] . ]
```

#### 4. Generation to Target Language

> *Isaiah, who was a prophet, wrote, “Listen to me. Before I send you, I'll send my messenger. And that messenger will prepare your path."*

---

### Core Linguistic Components

1. **Ontology (`apps/ontology`)**: Central store of all semantic concepts, meanings, part of speech, and contextual usage rules.
2. **Semantic Representation (`apps/sources`)**: TBTA clause and phrase structure encodings and semantic feature flags.
3. **Lexicon & Grammar (`apps/targets`)**: Target language vocabulary, features, and transformational grammar rules.
4. **Editor & Rule Engine (`apps/editor`)**: Grammar checking, validation, automated backtranslation, and AI-assisted Phase 1 encoding.
5. **Translation Copilot (`apps/copilot`)**: Flag extraction, contextual notes, and AI-assisted consultant briefs.

---

### Development Philosophies

All code in this repository adheres to the **TaBiThA Development Philosophies**. For complete definitions, detailed guidelines, and code examples, see the canonical [**AGENTS.md**](AGENTS.md).

| # | Philosophy | Core Tenet |
| :-: | :--- | :--- |
| **1** | **Self-contained components** | Parents manage layout and context; components encapsulate internal behavior and daisyUI styling. |
| **2** | **Normalized data** | Keep data normalized close to source with pure, deterministic transformations. |
| **3** | **Tabs for indentation** | Literal `tab` characters for indentation across all languages and configuration files. |
| **4** | **Code over comments** | Self-documenting code with intention-revealing names over excessive commenting. |
| **5** | **Classes at the end of elements** | Place `class="..."` after functional attributes and event handlers in Svelte templates. |
| **6** | **Guard clauses over nested logic** | Early returns to keep control flow flat and readable. |
| **7** | **Strict domain typing** | Explicit TypeScript interfaces and discriminating unions for linguistic models (avoid `any`). |
| **8** | **Semantic HTML & daisyUI 5** | Native HTML semantic tags (`<dialog>`, `<article>`, `<nav>`) styled with daisyUI 5 component classes. |
| **9** | **Limit use of `if`** | Object lookup maps, pattern matching, or polymorphism over deep `if`/`else` branches. |
| **10** | **`snake_case` naming** | `snake_case` for functions, variables, and files; `PascalCase` strictly for Svelte components and TS types. |
| **11** | **Pure functions** | Side-effect-free functions receiving one options object argument and returning one value. |
| **12** | **YAGNI & Minimal Surface Area** | Solve today's concrete need; adhere to the Rule of Three before extracting code to `packages/*`. |
| **13** | **Scope `prose` to content** | Apply Tailwind Typography's `prose` only to genuine text content, never a layout wrapper; escape nested components with `not-prose`. |
| **14** | **SvelteKit data-loading boundaries** | Keep component scripts to presentation and event wiring; fetching, shaping, and authorization decisions live in `load` functions or `$lib` data-layer modules. |
| **15** | **AI prompts live in separate Markdown files** | A `system_instruction` sent to the AI client is a `.md` file imported via `?raw`, not an inline template literal. |

> 📖 **Full Philosophy Guide & Examples**: See [**`AGENTS.md`**](AGENTS.md) at the workspace root.
