---
name: ai-client
description: AI calls through the shared @tabitha/ai client (Gemini on Vertex AI today). TRIGGER when writing, inspecting, or configuring AI features, prompt templates, structured output schemas, embeddings, or any LLM call in apps/* or packages/ai.
---

# AI calls in TaBiThA (via `@tabitha/ai`)

App code never constructs a `GoogleGenAI` client or holds a Gemini API key. Every AI call goes through `@tabitha/ai`, which builds the request itself and routes it through the Cloudflare AI Gateway to Vertex AI. Vertex is a hard requirement here; AI Studio keys are not used. `@google/genai` is only a dev dependency of `packages/ai`, for its types.

## Creating a client

`create_ai_client({ app, feature, gateway, defaults? })` returns an `AiClient`. The gateway values (`CLOUDFLARE_ACCOUNT_ID`, `AI_GATEWAY_TOKEN`, `GEMINI_PROJECT_ID`, `GEMINI_LOCATION`) are read from `$env/dynamic/private`; see `apps/copilot/src/hooks.server.ts` and `apps/editor/src/lib/server/ai_assist/client.ts`. The model and seed are fixed inside `packages/ai/src/client.ts` for every call site, so callers don't choose one.

## Calls

- `generate_json<T>({ contents, system_instruction?, schema, config? })` returns output validated against a JSON schema.
- `generate_text({ contents, system_instruction?, config? })`.
- Embeddings: `create_embedding_client(...)` and `format_embedding_input(...)`.

## Prompts

A `system_instruction` lives in a sibling `.md` file imported with `?raw` (AGENTS.md Philosophy #15), for example `apps/copilot/src/lib/server/semantic_notes_prompt.md`.
