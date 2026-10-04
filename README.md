# open-aso

> **The open-source alternative to AppTweak and Sensor Tower.**

App Store Optimization for your AI agent. open-aso gives Claude, Cursor or any MCP client real App Store data plus ASO expertise: keyword research, rank tracking, competitor gaps, review insights and metadata writing. It's free and open source, and you pay only DataForSEO's cost price for data, with no subscription and no markup.

**No dashboards to learn.** Ask your agent, and it does the analysis and builds whatever report or chart you want.

[open-aso.com](https://open-aso.com) · MIT licensed · Built for indie iOS developers

<!-- Demo GIF goes here: one prompt → a full ASO audit -->

```text
You:    Audit the App Store listing for my app
Claude: (calls open-aso: app, keywords, competitors, reviews…)
        Snapshot: ★4.6 (1,204 ratings) · 18 keywords in the top 10 · closest rival: Ovia
        Top fixes:
        1. Move "pregnancy tracker" into your subtitle: you're #14, difficulty 38 (high impact)
        2. Ovia ranks top 10 for "baby names" and "due date"; you don't rank (high impact)
        …
        Cost: $0.07
```

## Why open-aso

- **It works where you already work.** MCP tools and skills for Claude Code, Claude Desktop, Cursor and any MCP client. The MCP server is free, not a paid add-on.
- **You pay for data, not seats.** Data comes from [DataForSEO](https://dataforseo.com) at cost: about $0.0024 per rank check and $0.015 to research a keyword. Tracking 50 keywords daily costs about $3.60 a month. Every call shows its cost, and a daily cap keeps it safe.
- **It brings ASO expertise.** Skills for auditing, keyword research and metadata writing. Every metadata draft is checked against Apple's limits and fixed before you see it.
- **Your data stays yours.** Everything runs locally. Rank history lives in a SQLite file you can export.

## Quick start

You need [Node.js 22.13+](https://nodejs.org) and a free [DataForSEO](https://app.dataforseo.com/register) account. New accounts get $1 of credit, enough for hundreds of rank checks.

```bash
npx open-aso init     # find your app, connect DataForSEO, connect your agent
```

Prefer a browser? `npx open-aso ui` opens a local setup page that does the same thing:

1. **Find your app.** Search by name; no App Store ID needed.
2. **Connect DataForSEO.** Enter your **Email** and **API key**. In DataForSEO these are labelled "API login" and "API password", and you get them by clicking "Send by email" on the [API Access](https://app.dataforseo.com/api-access) page.
3. **Connect your agent.** One click for Claude Code, Claude Desktop or Cursor, or a copy-paste config for any MCP client.

Then ask your agent:

- *"Use open-aso to audit the App Store listing for my app"*
- *"Use open-aso to find keywords my app should target"*
- *"Use open-aso to write a new title, subtitle and keyword field"*
- *"Which keywords does [competitor] rank for that I don't?"*
- *"Track these keywords and tell me what moved this week"*

### Claude Code plugin

Install the skills and MCP server together:

```text
/plugin marketplace add madmax304/open-aso
/plugin install open-aso@open-aso
```

### Running from source (until the npm package is published)

```bash
git clone https://github.com/madmax304/open-aso.git
cd open-aso
npm install
npm run ui            # setup page; "Connect agent" points agents at your local copy
```

## What's included

### MCP tools

| Tool | What it does | Cost |
|---|---|---|
| `keywords` | Keywords an app ranks for (volume, position), or research any keyword (volume, difficulty 1–100, top apps, your rank) | ~$0.013 per app · ~$0.015 per keyword (~$0.0024 for difficulty only) |
| `rankings` | Your rank for each keyword (top 100) and change since the last check; saved to history | ~$0.0024 per keyword |
| `app` | Full listing, plus what changed since the last check (great for watching competitors) | ~$0.0012 |
| `competitors` | Apps competing for your keywords, or the keyword gap against one competitor | ~$0.013 · ~$0.03 |
| `reviews` | Recent reviews with a rating summary | ~$0.003 per 50 |
| `track` | Manage the daily tracking list of keywords, your apps and competitors | Free |
| `validate_metadata` | Checks title (30), subtitle (30) and keyword field (100) against Apple's limits and ASO best practice | Free |

Identical requests within 24 hours are served from a local cache for free. Every response includes `cost_usd` and `spend_today_usd`.

### Skills

| Skill | Use it for |
|---|---|
| `aso-audit` | "What should I fix?" Listing, keywords, competitors and reviews, turned into prioritized fixes |
| `keyword-research` | A scored shortlist of keywords you can realistically win, and where to put them |
| `metadata-writer` | Title, subtitle and keyword field options that pass every check |

### CLI

| Command | What it does |
|---|---|
| `open-aso init` | Interactive setup in the terminal |
| `open-aso ui` | Local setup page: app, DataForSEO, agents, tracking, usage |
| `open-aso mcp` | Starts the MCP server (agent configs run this) |
| `open-aso track add/remove/list` | Manage tracked keywords and competitors |
| `open-aso track run` | Daily rank check. Schedule it with cron, e.g. `0 8 * * * npx -y open-aso track run` |
| `open-aso usage` | Spend today and this month, plus recent calls |

## How open-aso compares

| | Price | Open source | Works in your AI agent |
|---|---|---|---|
| **open-aso** | **Free + data at cost** | ✓ | ✓ Free MCP + skills |
| AppTweak | From $79/mo, up to $549+/mo | – | Enterprise plan |
| Sensor Tower | Custom, often $30k+/yr | – | Enterprise plan |
| MobileAction | $15–239/mo | – | – |
| Appfigures | $9.99–599.99/mo | – | Paid credits |
| Astro | $108/yr, Mac only | – | – |

*Prices from public pricing pages and third-party estimates, October 2026. Product names are trademarks of their owners; open-aso isn't affiliated with them.*

What open-aso doesn't do (yet): Google Play, countries other than the US, download and revenue estimates, and store A/B testing.

## Costs and privacy

- **Costs:** you pay DataForSEO directly. A typical indie developer spends cents to a few dollars a month. The default daily cap is $1; change it in `open-aso ui` → Data connection.
- **Where data comes from:** DataForSEO's App Data and Labs APIs. Keyword volumes are DataForSEO's estimates, best used to compare keywords against each other. Apple's free search API is used only to find apps by name.
- **Privacy:** settings live in `~/.open-aso/config.json` (readable only by you) and history in `~/.open-aso/data.sqlite`. Your DataForSEO credentials are only ever sent to DataForSEO. open-aso has no telemetry.

## Roadmap

- ☁️ **Hosted cloud version:** no DataForSEO account needed, automatic tracking, and a one-click Claude connector. Start with $5, not $50. **[👍 the waitlist issue](https://github.com/madmax304/open-aso/issues/1)** and click Subscribe to hear when it launches.
- Google Play and more countries
- Apple Ads keyword popularity (bring your own Apple Ads account)
- App Store Connect: your real impressions and conversion, review replies, publishing metadata
- More skills: weekly competitor watch, review insights

*Watch → Custom → Releases on this repo to get an email for every release.*

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). The scope for v0.1 is in [SCOPE.md](SCOPE.md).

## License

[MIT](LICENSE). App Store data provided by [DataForSEO](https://dataforseo.com).
