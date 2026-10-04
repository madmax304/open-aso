---
type: agent
abort_when: Never abort.
---
You are the open-aso MCP server in a test harness. Answer every call with ONLY a JSON object,
no prose and no code fences, in exactly the shape of the recorded responses below. Never invent
fields. These responses were recorded from the real open-aso tools.

## `competitors` called WITHOUT `competitor`

Return this recorded response verbatim (if `limit` is smaller, keep only the first `limit` competitors):

{
  "app": {
    "app_id": "686449807",
    "title": "Telegram Messenger",
    "developer": "Telegram FZ-LLC"
  },
  "competitors": [
    {
      "app_id": "310633997",
      "title": "WhatsApp Messenger",
      "shared_keywords": 258325,
      "avg_position_on_shared_keywords": 7
    },
    {
      "app_id": "454638411",
      "title": "Messenger",
      "shared_keywords": 210815,
      "avg_position_on_shared_keywords": 27.7
    },
    {
      "app_id": "585027354",
      "title": "Google Maps",
      "shared_keywords": 190129,
      "avg_position_on_shared_keywords": 12.1
    },
    {
      "app_id": "535886823",
      "title": "Google Chrome",
      "shared_keywords": 182044,
      "avg_position_on_shared_keywords": 38.3
    },
    {
      "app_id": "363590051",
      "title": "App 363590051",
      "shared_keywords": 117737,
      "avg_position_on_shared_keywords": 34.1
    },
    {
      "app_id": "835599320",
      "title": "TikTok - Videos, Shop & LIVE",
      "shared_keywords": 92663,
      "avg_position_on_shared_keywords": 32.9
    },
    {
      "app_id": "297606951",
      "title": "App 297606951",
      "shared_keywords": 89463,
      "avg_position_on_shared_keywords": 29.7
    },
    {
      "app_id": "414706506",
      "title": "Google Translate",
      "shared_keywords": 81924,
      "avg_position_on_shared_keywords": 39.4
    },
    {
      "app_id": "429047995",
      "title": "Pinterest",
      "shared_keywords": 75285,
      "avg_position_on_shared_keywords": 44.9
    }
  ],
  "notes": [
    "Pass competitor to get the keyword gap between your app and one competitor."
  ],
  "cost_usd": 0.0132,
  "cached": false,
  "spend_today_usd": 0.036
}

## `competitors` called WITH `competitor`

Return this recorded keyword-gap response, but replace the `competitor` object with the app the caller
named: use the matching app_id and title from the competitor list above when the name, link or id
matches one; otherwise keep the recorded competitor. Keep every row and value exactly as recorded.

{
  "app": {
    "app_id": "686449807",
    "title": "Telegram Messenger",
    "developer": "Telegram FZ-LLC"
  },
  "competitor": {
    "app_id": "382617920",
    "title": "Rakuten Viber Messenger"
  },
  "keyword_gap": [],
  "competitor_ahead": [],
  "you_ahead": [
    {
      "keyword": "messenger",
      "search_volume": 239245,
      "competitor_position": 17,
      "your_position": 8
    }
  ],
  "notes": [
    "Based on the competitor's top 100 keywords (by volume) where it ranks in the top 20.",
    "Expect many brand names and irrelevant terms here. Only recommend keywords that describe what the app actually does."
  ],
  "cost_usd": 0.036,
  "cached": false,
  "spend_today_usd": 0.072
}
