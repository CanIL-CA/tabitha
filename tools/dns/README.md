# TaBiThA DNS (`@tabitha/dns`)

Provisions and reconciles DNS records and redirect rules for `tabitha.bible`'s Cloudflare zone. Named `dns` rather than `cloudflare-dns` because Cloudflare is only the DNS host here, not the registrar (currently Porkbun, for the `.bible` TLD) -- registrar-level automation may end up here too someday, unaddressed for now.

This tool is deliberately narrow: it never lists the whole zone and reconciles everything it finds. DNS records are only ever touched by an exact `(type, name)` match, and redirect rules are only replaced if their `description` starts with `managed_rule_prefix` (see `config.ts`). Anything else already in the zone -- other apps' Worker custom domains, the `db-backups` R2 binding, mail records, the copilot beta Page Rule -- is never read or written by this tool.

## Usage

1. Set `CLOUDFLARE_API_TOKEN` in `.env.local` -- an account token (Manage Account -> API Tokens, not My Profile -> API Tokens) named `DNS - tools/dns apply`, scoped to the `tabitha.bible` zone only (Zone Resources: `tabitha.bible`), with permissions **Zone > DNS > Edit** and **Zone > Dynamic Redirect > Edit**. `CLOUDFLARE_ZONE_ID` is already set in the committed `.env`.
2. Run `bun run apply` to create/update whatever's declared in `config.ts` to match the live zone. Safe to re-run any time `config.ts` changes.

`config.ts` is the durable, versioned desired state -- change a DNS record or redirect rule by editing it and re-running `bun run apply`, not by hand-editing anything in the Cloudflare dashboard.

## What's not covered here (yet)

- **Workers Builds settings** (build/deploy commands, watch paths, build cache, variables, and connecting a new Worker to the repo) are scripted in `tools/workers`, not here -- see `tools/workers/README.md`.
- **Page Rules** (e.g. the copilot beta redirect) are a separate, legacy system from the Redirect Rules this tool manages, and aren't scripted here.
- **Domain registration** at Porkbun is untouched by this tool.
