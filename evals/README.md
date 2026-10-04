# Skill evals

An eval suite for the three open-aso skills (`aso-audit`, `keyword-research`, `metadata-writer`), run with [`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals).

It uses no live data. No DataForSEO credentials are needed and no DataForSEO credit is spent. Every tool answer comes from the responses recorded in `test/fixtures/dataforseo/`, which were captured for **Telegram Messenger** (app id 686449807). So in every case, Telegram is "the user's app".

## Run it

From the repository root:

```bash
# Quick check: one run per case, plugin arm only (no baseline)
claude plugin eval . --trust-plugin --runs 1 --ablation none --max-cost-usd 3

# Full suite: 3 runs per case, with and without the plugin (default), HTML report
claude plugin eval . --trust-plugin --max-cost-usd 20

# One skill, or one case
claude plugin eval . --trust-plugin --tag metadata-writer
claude plugin eval . --trust-plugin --case fix-failing-draft
```

For CI or comparisons over time, pin the models: `--model <id> --judge-model <id>`. Results go to `evals/results/<timestamp>/` (gitignored): `aggregate-result.json` and `report.html`.

The default `--threshold` is 1.0, so the command exits 1 unless every case scores perfectly. Pass `--threshold 0.8` (or whatever bar you want) to gate on it.

`--trust-plugin` skips the one-time "trust this plugin directory?" prompt. You don't need `--allow-tools`, `--scaffold` or `--allow-real-servers`. Cases only use `Skill` and the mocked open-aso tools, and mocked tools don't need a grant.

## What it costs

**Only Claude usage. No DataForSEO credit.** These numbers are rough estimates, not measurements (see the PR that added this suite). Each run of the agent under test is one `claude -p` session of about 10–30 turns:

| Run | Estimate |
|---|---|
| Quick check (`--runs 1 --ablation none`, 6 runs) | about $1–3 |
| Full suite (3 runs × 2 arms × 6 cases = 36 runs) | about $5–15 |

Things that add to the cost:
- **Agent mocks.** Four of the mocked tools are played by the judge model (see below), so each of those tool calls is a small model call.
- **`llm` graders.** Each takes 3 judge votes.
- **The `aso-audit` cases cost the most.** The recorded `reviews` answer is about 70 KB.

Use `--max-cost-usd` as a hard ceiling. The JSON result reports `costUsd` at list price.

## How the open-aso tools are faked

`claude plugin eval` never starts the plugin's real MCP server unless you ask it to. It answers tool calls from mock files in `evals/mocks/<server>/<tool>.md`, and the server here is `open-aso`, from `.mcp.json`. There's no way to point a run at a different server process without editing the plugin's `.mcp.json`. So the fake server's output is recorded into those mock files.

- **`fake-server/fixture-context.ts`** builds a context for open-aso's **real** tools. It plugs a fake `fetch` into the real `DataForSeoClient` that answers from `test/fixtures/dataforseo/`, and it throws on anything it can't answer, so it never reaches the network. Storage is in-memory SQLite. The real provider, cost metering, difficulty scoring and `validate_metadata` all run unchanged. It imports from `src/` read-only.
- **`fake-server/server.ts`** serves those tools over stdio as a standalone fake MCP server, for trying the skills by hand: `claude mcp add open-aso-fake -- npx tsx evals/fake-server/server.ts`.
- **`fake-server/record-mocks.ts`** calls each real tool through MCP and writes the answers into `mocks/open-aso/`, plus `_tools.json`, so the mocked tools have the real descriptions and input schemas. Re-run it whenever the tools or fixtures change, and commit the result:

  ```bash
  npx tsx evals/fake-server/record-mocks.ts
  npx tsc -p evals/tsconfig.json   # typecheck the fake server
  ```

The mocks come in two kinds:

| Tool | Mock | Why |
|---|---|---|
| `app`, `reviews`, `track` | `fixed`: the recorded answer, word for word | The answer doesn't depend on the input |
| `keywords`, `competitors`, `rankings` | `agent`: the judge model plays the server from the recorded answers in the file | Mode 1 and mode 2 return different data, and mode 2 picks rows by the keywords asked for. A fixed mock can't do that |
| `validate_metadata` | `agent`: the judge model applies the rules from `src/metadata/validate.ts`, using two real answers as examples | Validation has to be computed from the input |

Limits of this setup:
- **Agent mocks can vary between runs and can miscount characters.** That's why the metadata cases check Apple's 30/30/100 limits with deterministic `regex` graders on the final answer, instead of trusting the mock's counts. After a clean run, copy the recordings listed in `results/<ts>/mock-recordings/ADOPT.txt` into `mocks/.replay/open-aso/`. Later runs then replay those answers without a model call.
- **The fixtures are thin.** There are only two recorded searches ("messenger" and "chat app"), so mode-2 keywords reuse the closer one. Search volume is known only for keywords in the recorded Labs data, and other keywords come back with `search_volume: null`. The recorded keyword gap is small, because the fixture competitor (Viber) ranks in the top 20 for only one shared keyword.
- **Brand noise is plentiful, which is what the brand-filtering checks need.** Telegram's recorded keywords are mostly other brands: youtube, gmail, facebook, whatsapp, discord, and so on.

## The cases

Every case has a `skill-fired` grader: a `tool_used` check that the intended skill was invoked. In the default two-arm mode it's reported but not scored, per the eval docs. The MCP tool names are `mcp__plugin_open-aso_open-aso__<tool>`.

### aso-audit

| Case | Prompt | Graders |
|---|---|---|
| `audit-my-app` | "Audit my App Store listing and tell me what to fix first." | Calls `app` and `keywords`. **report-structure** (llm): a snapshot (rating, keyword footprint, main competitor), prioritized fixes that cite data, and next-step offers. **no-brand-noise** (llm): no other brand or unrelated term is recommended. **states-cost** (regex): a dollar amount is reported |
| `rejects-brand-bait` | The user asks to target youtube, gmail and facebook "because of the volume" | Calls `keywords`. **explains-brand-terms** (llm): declines, with a reason. **no-brand-noise** (llm). **snapshot-fixes-offers** (llm) |

### keyword-research

| Case | Prompt | Graders |
|---|---|---|
| `shortlist-for-my-app` | "Find App Store keywords my app should target." | Checks candidates with `keywords` mode 2 (`keywords: [...]`). **no-brands-or-irrelevant-terms** (llm): no competitor brands, no unrelated terms. **shortlist-with-reasoning** (llm). **states-total-cost** (regex: "total/cost/spent … $0.xx") |
| `new-app-seed-idea` | An unreleased encrypted family group-chat app | Has its own `keywords` mock: there's no listing, so mode 1 errors and `your_position` is always null. Checks candidates with mode 2. **no-brands-or-irrelevant-terms** (llm). **states-total-cost** (regex) |

### metadata-writer

Both prompts ask the agent to end with `TITLE:`, `SUBTITLE:` and `KEYWORDS:` lines, so the limits can be checked deterministically.

| Case | Prompt | Graders |
|---|---|---|
| `write-for-my-app` | New metadata from 5 target keywords; "Telegram" must stay in the title | Calls `validate_metadata`. **looped-until-clean** (llm over `mock_calls`): the last validation passes every check, or only a warning that can't be fixed. **regex**: the title is 1–30 characters, the subtitle 1–30 and the keyword field 1–100, and no final line is over its limit |
| `fix-failing-draft` | Fix a draft with a 36-character title, a 36-character subtitle, spaces after commas, words repeated across fields, singular/plural pairs, filler words and an underfilled keyword field (7 checks fail in the real validator) | Calls `validate_metadata` **at least twice** (validate, fix, re-validate). **looped-until-clean** (llm over `mock_calls`). The same limit regexes |
