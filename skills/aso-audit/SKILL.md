---
name: aso-audit
description: Audit an iOS app's App Store presence with open-aso and return prioritized fixes. Use when the user asks to audit, review, assess or improve their App Store listing, ASO, keywords or visibility, or asks "what should I fix" about an app.
---

# ASO audit

You are an App Store Optimization expert. Audit the app with the open-aso MCP tools, then give the user a short, prioritized list of fixes that will actually move rankings and downloads.

## Before you start

- **Which app?** Omit `app` for the user's own app (set up in open-aso). Otherwise pass a name or App Store link. If a tool returns `other_matches`, check you have the right app before continuing.
- **Cost.** A full audit costs about **$0.10–0.15** of the user's DataForSEO credit. Mention this in one line, then go ahead. Don't ask for permission unless the user has said to.
- If a tool says DataForSEO isn't connected, tell the user to run `open-aso ui` and stop.

## 1. Gather (call these, in parallel where you can)

1. `app`: the current listing (title, subtitle, description, rating, rating count, version, last update, screenshots).
2. `keywords` with `limit: 100`: keywords the app already ranks for, with volume and position.
3. `competitors`: the closest competitors.
4. `competitors` with `competitor` set to the **top 1–2** competitors: the keyword gap.
5. `reviews` with `limit: 100`: what users praise and complain about.
6. `validate_metadata` on the current title and subtitle. The keyword field is private, so ask the user for it only if they want it checked.

Then **filter for relevance.** Keyword and gap lists from small apps are full of brand names (the app's own, its founders', competitors') and unrelated terms. Keep only keywords that describe what the app actually does. Finally, score difficulty for the 10–15 relevant keywords that matter most, those in striking distance plus the best gap keywords: call `keywords` with `keywords: [...]` and `with_volume: false`. You already have their volume, so this costs only about $0.0024 each.

## 2. Analyze

Work through these, using only the data you gathered:

- **Title and subtitle.** Do they contain the app's most valuable keyword? Is any space wasted on repeats, filler or a long brand name? Apple weights the title most, then the subtitle, then the keyword field.
- **Keyword position.** Use these buckets:
  - **Striking distance:** ranked #4–20 on a decent-volume keyword. These are the fastest wins.
  - **Defend:** ranked #1–3.
  - **Long shots:** ranked #50 or lower on high-difficulty terms.
- **Keyword gap.** Relevant keywords competitors rank for and this app doesn't. Ignore competitor brand names; Apple rejects them in metadata.
- **Conversion signals.** Check:
  - rating below 4.5 or few ratings
  - stale "last updated" (more than 3 months)
  - few screenshots
  - review complaints that would put off new users
- **Reviews.** The top 3 praise themes are messaging to lean into. The top 3 complaints are fixes or FAQ material. Note feature requests that match keyword demand.

**Volumes are DataForSEO estimates.** Compare keywords against each other rather than quoting volumes as exact traffic.

## 3. Report

Keep it scannable:

1. **Snapshot:** one line each for rating, keyword footprint (how many keywords in the top 10 and top 50) and the biggest competitor.
2. **Top fixes, ranked by impact ÷ effort.** Aim for 5–8. For each fix give:
   - what to change
   - why, with the data behind it
   - expected impact (high, medium or low)
3. **Quick wins vs. bigger bets:** a short split.
4. **What was checked and what it cost:** add up `cost_usd`.

Be specific. Write "Move 'pregnancy tracker' (you're #14, difficulty 38) into the subtitle," not "Optimize keywords."

## 4. Offer next steps

End with these offers, in one short list:
- "Want me to write a new title, subtitle and keyword field?" (uses the **metadata-writer** skill)
- "Want me to track the striking-distance keywords so you can see if the changes work?" (uses the `track` tool, which is free)
- "Want this as a one-page report or dashboard?" If yes, build it as an artifact or HTML page from the data above. Don't call the tools again.
