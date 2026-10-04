---
name: metadata-writer
description: Write an App Store title, subtitle and keyword field that pass every App Store rule, using open-aso's validate_metadata to check and fix each draft. Use when the user asks to write, rewrite or improve their app name, title, subtitle, keyword field or App Store metadata.
---

# App Store metadata writer

Write metadata that ranks and converts, and **never hand the user a draft that fails a check**.

## Apple's rules (validate_metadata checks these)

| Field | Limit | Notes |
|---|---|---|
| Title | 30 characters | Weighted most for ranking. Usually "Brand: Main Keyword". Must read naturally; it's the first thing people see |
| Subtitle | 30 characters | Second most weight. A benefit-led phrase with 1–2 keywords |
| Keyword field | 100 characters | Hidden from users. Comma-separated, **no spaces after commas**, single words or short phrases |

Apple indexes all three fields **together** and matches word combinations across them. So:
- **Never repeat a word across fields.** "tracker" in the title means it can't go in the keyword field too.
- **Use singular *or* plural, not both.** Apple matches both forms.
- **Skip filler:** "app", "free", "the", "and", "iphone".
- **No competitor brand names or trademarks.** Apple rejects these at review.
- **Fill the keyword field** to 90–100 characters. Unused space is wasted ranking potential.

## 1. Gather inputs

- The current listing: `app` (omit `app` for the user's own app).
- Target keywords from the conversation. If there aren't any, run a quick version of **keyword-research**: `keywords` on the app, plus `keywords` mode 2 on 10–15 candidates.
- The current keyword field, if the user wants it improved. It isn't public, so ask for it.
- What the brand name must be, and anything the user won't change.

## 2. Draft

Write **2–3 options** with different strategies, for example:
- **Keyword-first:** the strongest keyword in the title.
- **Brand-first:** keep the brand prominent, with keywords in the subtitle.
- **Long-tail:** target lower-difficulty phrases the app can win now.

Rules of thumb:
- Put the highest-value relevant keyword in the title.
- Write the subtitle for humans first: a benefit plus keywords.
- In the keyword field, spread individual words that combine with title and subtitle words into phrases. Example: title "Natal: Pregnancy Tracker" plus keyword "week" also matches "pregnancy week".

## 3. Validate, then fix: always loop

For **every** option:
1. Call `validate_metadata` with `title`, `subtitle` and `keywords`.
2. If any check has `ok: false`, errors **or** warnings, fix exactly what the message says and validate again.
3. Repeat until every check passes, up to 5 rounds. If a warning truly can't be fixed (for example, the brand name contains a repeated word), keep it and explain why.

`validate_metadata` is free and instant, so loop as often as needed. Don't count characters yourself; trust the tool's `counts`.

## 4. Present

For each option:
- **Title, subtitle and keyword field** in a code block, so they're easy to copy.
- **Character counts** from the tool (e.g. 29/30, 30/30, 98/100) and "✓ all checks passed".
- **Keywords covered,** and in which field.
- One line on the **strategy and trade-off.**

Then give your recommendation and why.

## 5. Offer next steps

- "Want me to track these keywords now, so we can measure the impact after you publish?" Use `track` with `action: "add"`, and run `rankings` once now for a baseline.
- "Check again 1–2 weeks after the update goes live." Rankings take time to move after a metadata change.
- "Want this as a one-page summary to share?" Build it as an artifact.
