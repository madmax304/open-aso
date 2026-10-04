---
name: keyword-research
description: Find App Store keywords an iOS app should target, using open-aso for real search volume, difficulty and rankings. Use when the user asks for keyword ideas, keyword research, what to rank for, or how to get found in App Store search.
---

# App Store keyword research

Produce a shortlist of keywords the app can realistically win, backed by data from the open-aso MCP tools.

## Before you start

- **Which app?** Omit `app` for the user's own app. For a new app with no listing yet, work from the user's description and seed ideas instead.
- **Cost.** Checking a keyword costs about **$0.015** with `keywords` mode 2. A typical session checks 20–40 keywords, about **$0.30–0.60**. Say this in one line. If you plan to check more than 40, confirm first.

## 1. Collect candidates

1. **What the app already ranks for:** `keywords` with `limit: 100`.
2. **Competitors:** `competitors`, then `competitors` with `competitor` set to the top 2–3. Take relevant keywords from `keyword_gap` and `competitor_ahead`.
3. **Your own ideas.** Brainstorm what a user would actually type in the App Store search box:
   - features ("contraction timer")
   - problems ("can't sleep")
   - audiences ("for new moms")
   - synonyms and long-tail versions
   - App Store search is short. Prefer 1–3 word phrases.
4. Remove brand names (competitors' and the app's own founders' or coaches' names; Apple rejects competitor brands in metadata) and anything irrelevant to what the app really does. Expect to drop most of the raw lists: for small apps they're mostly noise.

## 2. Check candidates

Run `keywords` mode 2 (`keywords: [...]`, up to 25 per call) on the candidates:
- **New ideas** (no data yet): use the default, which includes volume, at about $0.015 each.
- **Keywords you already have volume for** from steps 1–2: add `with_volume: false`, at about $0.0024 each.

Each result gives:
- `search_volume`: a DataForSEO estimate. Compare keywords against each other rather than treating it as exact traffic.
- `difficulty` (1–100): based on the top 10 apps' rating counts, how directly their titles target the keyword, their ratings, and how many are giants.
- `your_position`: the user's current rank, if any.
- `top_apps`: who you'd be competing with.

## 3. Score and shortlist

Judge each keyword on four things:
- **Relevance (most important):** would someone searching this want this app? Irrelevant traffic doesn't convert, and it hurts rankings.
- **Opportunity:** high volume relative to the others and low difficulty. Difficulty under 40 is realistic for a small app; over 70 needs a strong brand or rating count.
- **Momentum:** already ranking #4–30 means it's easier to climb.
- **Fit for a field:** the strongest keyword goes in the title, the next ones in the subtitle, and single words in the keyword field.

Shortlist 10–20 keywords.

## 4. Present

A table, sorted by recommendation:

| Keyword | Volume | Difficulty | Your rank | Where to use | Why |
|---|---|---|---|---|---|

Then add:
- **3 headline picks** with one sentence each.
- **Skipped keywords and why**, briefly, e.g. "'pregnancy' is too hard (difficulty 92, all giants)."
- **Total cost:** add up `cost_usd`.

## 5. Offer next steps

- "Want me to track these keywords?" Use `track` with `action: "add"`; tracking is free, and daily checks cost about $0.0024 per keyword.
- "Want me to write metadata around them?" (uses the **metadata-writer** skill)
- "Want this as a spreadsheet or chart?" Build it as an artifact or CSV from the data you already have.
