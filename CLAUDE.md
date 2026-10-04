# open-aso: agent instructions

Read `SCOPE.md` first. It is the source of truth for what v0.1 includes. If a task seems to need something not in SCOPE.md, stop and ask; don't add scope.

## What this is

An open-source, agent-first ASO (App Store Optimization) toolkit: an MCP server, a CLI, skills and a thin local UI, powered by DataForSEO. It's the open-source alternative to AppTweak and Sensor Tower.

## Principles (non-negotiable)

- **The UI configures, the agent analyzes.** Never build charts or analysis screens in the UI.
- **All DataForSEO traffic goes through `src/data/dataforseo/client.ts`**, and features call the `AsoDataProvider` interface in `src/data/provider.ts`, never the client directly.
- **The only non-DataForSEO call is the app picker** (Apple's free iTunes Search API), used solely to find an app by name. Never use it for ASO data. See SCOPE.md section 2a.
- **Every paid call returns `Billed<T>`** (data, `costUsd`, `cached`) and is logged to the `api_calls` table. Paid calls must be refused once the daily spend cap is reached.
- **iOS and US only** in v0.1 (`US_MARKET` in `src/core/types.ts`).
- **No secrets in the repo.** Credentials live in `~/.open-aso/config.json` (mode 600) or `.env` for local development. `.env` is gitignored.
- **No native dependencies.** Use `node:sqlite` (Node 22.13+), not better-sqlite3, so `npx open-aso` installs cleanly everywhere.
- **Never copy code from respectlytics/respectaso.** It's AGPL. Ideas are fine; code is not.

## Commands

```bash
npm install
npm run typecheck
npm test            # vitest, no network
npm run dev -- help # run the CLI from source
npm run spike       # live DataForSEO calls; needs .env with real credentials and costs real money
```

## Code conventions

- TypeScript, ESM (`"type": "module"`). Use `.js` extensions in relative imports, as NodeNext requires.
- `strict` mode is on, including `noUncheckedIndexedAccess`.
- Validate MCP tool inputs with zod.
- Match the existing style: small modules, few comments, and comments that explain *why*.
- **Tests never hit the network.** Use the fake-fetch pattern in `test/client.test.ts`, or the real recorded responses in `test/fixtures/dataforseo/`, which come from `npm run spike`.

## Repo layout and workstream ownership

When several agents work in parallel, give each one a single area below to avoid merge conflicts. Only edit files outside your area when the task requires it, and say so in your PR description.

| Path | Area |
|---|---|
| `src/core/` (shared types and config) | Foundation. Change only with care, and note it in your PR |
| `src/data/`, `src/db/` | Data layer: provider, cache, cost logging, spend cap, SQLite |
| `src/mcp/`, `src/aso/`, `src/cli.ts`, `src/cli/` | MCP server, ASO logic and CLI |
| `src/ui/` | Local setup UI |
| `src/metadata/`, `skills/`, `.claude-plugin/` | `validate_metadata`, skills and the Claude Code plugin |
| `site/`, `README.md`, `CONTRIBUTING.md` | Website and launch assets |
| `test/` | Whoever owns the code under test |

Note: the SQLite schema lives in `src/db/schema.ts` as a string so it ships in `dist/`. `node:sqlite` is loaded via `createRequire` because Vite/vitest 2 don't recognise it yet.

## Definition of done for any PR

- `npm run typecheck` and `npm test` pass.
- New logic has tests that use fixtures, never the network.
- No new runtime dependencies without a reason in the PR description.
- The PR description lists anything you changed outside your owned paths.
