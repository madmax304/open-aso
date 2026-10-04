# open-aso v0.1 scope

> **open-aso: the open-source alternative to AppTweak and Sensor Tower.**
> Free MCP server, CLI and skills for indie iOS developers. Data at DataForSEO's cost price.
> Your agent does the analysis and builds the views you want.

Decided 2026-10-03. Monetization (hosted cloud) is out of scope for v0.1.

## Principles

1. **The UI configures, the agent analyzes.** No dashboards, no charts.
2. **DataForSEO is the only source of ASO data.** One key, one code path. The single exception is the app picker, which uses Apple's free search API only to *find* an app (see section 2a).
3. **iOS and US only.**
4. **Local first.** Config and history live on the user's machine.
5. **Costs are always visible.** Every call reports what it cost.
6. **MIT license,** free forever, including the MCP server.

## 1. Package

- npm package `open-aso`, with CLI names `open-aso` and `oaso`. TypeScript, Node 22.13+, MIT.
- One package contains the MCP server, the CLI, the local UI and the skills.
- Also shipped as a Claude Code plugin that bundles the MCP server and skills.

## 2. Data (DataForSEO only)

| Endpoint | Powers |
|---|---|
| App Data `app_searches` (priority queue) | Rankings, plus the top-10 results used for difficulty |
| App Data `app_info` (priority queue) | Listing details and snapshots |
| App Data `app_reviews` (priority queue) | Reviews |
| Labs `keywords_for_app` (live) | Keywords an app ranks for, with volume (US/English only) |
| Labs `app_competitors` (live) | Competitor discovery |
| Labs `keywords_for_app` with a keyword filter | Keyword gap (competitor's top keywords, checked against your app) and volume for any typed keyword |

- **Difficulty** is our own open, documented score built from the top-10 results: ratings, review counts and title match.
- **Cost logging** reads the `cost` field of every response.
- **24h cache:** an identical request within 24 hours is served free from the local cache.
- Queued tasks are polled inside the tool call. In the spike they took 6–13 seconds on the priority queue.
- **Volume for any typed keyword.** DataForSEO has no direct volume lookup, but Labs knows volume for keywords an app ranks for. So for a typed keyword we fetch the search results, then ask Labs about that keyword for the #1 app. Costs about $0.015 per keyword, and was verified live.
- **Keyword gap without `app_intersection`.** That endpoint only returns keywords *both* apps rank for. Instead we take the competitor's top keywords and check which ones your app ranks for, using two Labs calls (about $0.03).
- **Labs results need sorting and filtering.** In the spike, the default order put big brand terms first ("youtube", "gmail") and the keyword gap included junk ("instagram##"). Sort by volume or position and drop malformed keywords.

## 2a. App picker (Apple's free search API)

Users don't know their App Store ID, so we never ask for it. Anywhere an app is needed, users search by name:

- **Source:** `https://itunes.apple.com/search?entity=software&country=us&term=…`. It's free, needs no key and responds in under a second, so results can update as you type. It's used **only to find and name apps**, never for ASO data. The `competitors` tool also uses `/lookup` to show competitor names, because DataForSEO returns only their ids.
- **Results** show icon, name, developer and rating, so users can tell which app is theirs.
- **Pasting an App Store link** (`apps.apple.com/…/id123456789`) also works; we extract the ID.
- **It works before DataForSEO is connected,** so setup can start with "find your app."
- **Where it's used:** setup on the UI Home page, adding apps and competitors on the Tracking page, `open-aso init` (type a name, pick from a numbered list), and the `app` and `track` MCP tools, which accept a name, a link or an ID.
- **Rate limit:** about 20 requests per minute, so debounce typing by about 300ms.

## 3. MCP tools (7)

| Tool | What it does | Cost |
|---|---|---|
| `keywords` | Keyword research from an app or competitor: volume, difficulty, who ranks | Uses DataForSEO credits |
| `rankings` | Current ranks for an app's keywords (saved), plus history for tracked keywords | Uses DataForSEO credits |
| `app` | Listing details, saved as a snapshot, with what changed since last time. Accepts an app name, App Store link or ID | Uses DataForSEO credits (finding the app is free) |
| `competitors` | Competing apps plus keyword gap | Uses DataForSEO credits |
| `reviews` | Recent reviews for the agent to analyze | Uses DataForSEO credits |
| `track` | Add, remove or list tracked apps and keywords. Apps can be given by name, link or ID | Free |
| `validate_metadata` | Checks title, subtitle and keyword field against Apple's rules | Free (runs locally) |

Every response includes `cost_usd`, `cached` and `spend_today_usd`.

## 4. Skills (3)

- `aso-audit`: "look at my app and tell me what to fix."
- `keyword-research`: from a seed idea or an app to a shortlist, with reasoning.
- `metadata-writer`: writes title, subtitle and keyword field, and loops on `validate_metadata` until every check passes.

Each skill ends by offering to build the results as an artifact.

## 5. CLI

| Command | What it does |
|---|---|
| `init` | Find your app by name (pick from a list), then enter your DataForSEO email and API key, test the connection, and write the config |
| `ui` | Opens the local UI |
| `mcp` | Starts the MCP server over stdio |
| `track run` / `add` / `remove` / `list` | Runs the daily check and manages the tracking list |
| `usage` | Shows spend today and this month |

## 6. Storage

- `~/.open-aso/config.json`: DataForSEO credentials (stored internally as Base64 of email:apiKey), your apps and the spend cap. File mode 600.
- `~/.open-aso/data.sqlite`: tracked apps and keywords, rank snapshots, listing snapshots, the API call log and the cache. Uses `node:sqlite`; no native dependencies.

## 7. Local UI (`open-aso ui`, on localhost, 4 pages)

- **Home:** setup checklist, starting with "Find your app" (app picker), then spend today, ⭐ Star on GitHub, and ☁️ Join the cloud waitlist (a placeholder link for now).
- **Data connection:** two fields, **Email** and **API key** (hint: DataForSEO labels these "API login" and "API password"), with an "or paste your Base64 value" alternative, an automatic connection test, DataForSEO balance, the $1 free credit tip, spend, the daily cap and recent calls.
- **Connect your agent:** one-click config for Claude Code, Claude Desktop and Cursor, a copyable snippet and short instructions.
- **Tracking:** apps (added via the app picker), keywords and competitors, with latest rank and change, a history table, "Run check now", scheduling instructions and CSV/SQLite export.

## 8. Guardrails

- A daily spend cap, $1 by default.
- The 24h cache.
- Credentials never leave the machine except in requests to DataForSEO. The app picker sends only the search term to Apple.

## 9. Website

- A static page in the `site/` folder, served by GitHub Pages at open-aso.com.
- Contents: the "alternative to" headline, demo GIF, install command, GitHub link and a waitlist button (placeholder).

## 10. Launch assets

- A README with the framing and a comparison table (AppTweak, Sensor Tower, MobileAction, Appfigures, Astro).
- A note on trying it free with DataForSEO's $1 credit.
- A demo GIF.
- A gallery of 3 example artifacts.
- LICENSE and CONTRIBUTING.

## 11. Quality

- Tests use recorded DataForSEO fixtures and never touch the network.
- Unit tests for difficulty and `validate_metadata`.
- A skill eval: run the 3 skills on 5 real apps before launch.

## Not in v0.1

- **Data sources:** Google Play, other countries, other free Apple endpoints (RSS charts, reviews RSS) for ASO data, the Apple Ads Platform API, App Store Connect, the Google Play Developer API.
- **Features:** top charts, download estimates, review replies, pushing metadata, competitor-watch and weekly-report skills.
- **Platform:** CLI tool passthrough, hosted cloud, remote MCP, accounts, billing, credits, teams, a built-in scheduler.
- **UI:** any charts or analysis screens.

## Roadmap notes

- Hosted version: DataForSEO's minimum top-up is $50, so the hosted pitch is "start with $5, not $50."
- Closest competitor is respectlytics/respectaso: AGPL, a Mac app, Pro at $120/yr, MCP is Pro-only. **Do not copy its code (AGPL).**
