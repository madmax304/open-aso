# Contributing to open-aso

Thanks for helping. open-aso is small on purpose, and these notes keep it that way.

## Principles

- **The UI configures, the agent analyzes.** We don't add charts or analysis screens. If you want a new view, make it a better tool or skill, and let the agent build the view.
- **Data and expertise over features.** The best contributions make the data more accurate or the skills smarter.
- **Costs are always visible.** Every paid call returns its cost and goes through the cache and spend cap.
- **No native dependencies.** `npx open-aso` must install cleanly everywhere.

[SCOPE.md](SCOPE.md) lists what v0.1 includes. For anything bigger than a fix, please open an issue first.

## Development

```bash
git clone https://github.com/madmax304/open-aso.git
cd open-aso
npm install
npm test             # never touches the network
npm run typecheck
npm run ui           # local setup page
npm run dev -- mcp   # MCP server from source
```

Live API calls cost real money and need credentials in `.env` (see `.env.example`):

```bash
npm run spike -- --app 1234567890 --competitor 2345678901 --keywords "habit tracker"
```

This also refreshes the recorded responses in `test/fixtures/dataforseo/`, which tests use instead of the network.

## Project layout

| Path | What's there |
|---|---|
| `src/data/` | DataForSEO client and provider, Apple app search, metering (cache and spend cap) |
| `src/db/` | Local SQLite storage |
| `src/aso/` | Difficulty score, app resolution, daily track run |
| `src/metadata/` | `validate_metadata` rules |
| `src/mcp/` | MCP server and tools |
| `src/ui/` | Local setup UI (one HTML page plus a small JSON API) |
| `src/cli/`, `src/cli.ts` | CLI commands |
| `skills/` | Agent skills (`SKILL.md` files) |
| `site/` | open-aso.com landing page |

## Pull requests

- Keep them focused, with one change per PR.
- `npm run typecheck` and `npm test` must pass. New logic needs tests that use fixtures or fakes, never the network.
- Explain any new runtime dependency.
- Never commit credentials. `.env` is gitignored, and fixtures must not contain account details.

## Skills

Skills live in `skills/<name>/SKILL.md`. A good skill:
- tells the agent which tools to call and in what order
- states the expected cost up front
- explains how to judge the data, not just fetch it
- ends with concrete next steps

Test a skill by running it on a few real apps and reading the output critically.
