// Records open-aso's real tool responses (against the fixture context, so no
// network and no cost) into the mock files `claude plugin eval` serves in place
// of the open-aso MCP server:
//
//   npx tsx evals/fake-server/record-mocks.ts
//
// Re-run it whenever the tools or the fixtures change, and commit the output.
//
// Tools whose answer doesn't depend on the input (app, reviews, track) become
// fixed mocks. The others (keywords, competitors, rankings, validate_metadata)
// become `type: agent` mocks: the judge model plays the server, using the
// recorded responses embedded in the file, because a fixed mock can't pick
// rows by input or compute validation.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { validateMetadata, LIMITS } from "../../src/metadata/validate.js";
import { createFixtureContext, INTERSECTION_RIVAL_ID } from "./fixture-context.js";

const EVALS = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOCKS = join(EVALS, "mocks", "open-aso");
/** The keyword-research "new app" case has no listing, so it gets its own keywords mock with no ranks. */
const NEW_APP_MOCKS = join(EVALS, "keyword-research", "new-app-seed-idea", "mocks", "open-aso");

/** Candidates an agent is likely to check for a messaging app. Mode-2 answers are recorded for each. */
const KEYWORD_POOL = [
  "messenger", "chat", "chat app", "messaging", "messaging app", "secure messaging", "secure messenger",
  "secure chat", "private messenger", "private chat", "private messaging", "encrypted chat",
  "encrypted messaging", "encrypted messenger", "group chat", "group messaging", "video call",
  "voice call", "free calls", "text app", "texting app", "instant messaging", "messages", "chat rooms",
  "channels", "stickers", "file sharing", "cloud storage", "secret chat", "voice messages",
  "chat with friends", "social chat", "communities", "bots", "family chat", "fast messenger",
  "end to end encryption", "privacy", "telegram", "whatsapp", "signal", "viber", "discord",
];

const ctx = createFixtureContext();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await createMcpServer(ctx, "eval-fixtures").connect(serverTransport);
const client = new Client({ name: "record-mocks", version: "1.0.0" });
await client.connect(clientTransport);

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ text: string }>)[0]!.text;
  if (result.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text);
}

const json = (value: unknown) => JSON.stringify(value, null, 2);
const compact = (value: unknown) => JSON.stringify(value);

// ---------- record ----------

const tools = await client.listTools();
const app = await call("app");
const reviews = await call("reviews", { limit: 100 });
const keywordsMode1 = await call("keywords", { limit: 100 });
const competitorList = await call("competitors");
const keywordGap = await call("competitors", { competitor: INTERSECTION_RIVAL_ID });

const mode2Rows: Array<Record<string, unknown>> = [];
let mode2Cost = 0;
for (let i = 0; i < KEYWORD_POOL.length; i += 25) {
  const batch = KEYWORD_POOL.slice(i, i + 25);
  const result = await call("keywords", { keywords: batch });
  mode2Rows.push(...result.keywords);
  mode2Cost += result.cost_usd;
}
const costWithVolume = Math.round((mode2Cost / KEYWORD_POOL.length) * 10_000) / 10_000;
const costWithoutVolume = 0.0024;
const mode2Notes = (await call("keywords", { keywords: ["chat"], with_volume: false })).notes;

// Top apps differ only by which recorded SERP answered, so store them once.
const topAppsBySerp = new Map<string, unknown>();
const rowsCompact = mode2Rows.map((row) => {
  const key = compact(row.top_apps);
  if (!topAppsBySerp.has(key)) topAppsBySerp.set(key, row.top_apps);
  const serp = `serp_${[...topAppsBySerp.keys()].indexOf(key) + 1}`;
  const { top_apps: _topApps, ...rest } = row;
  return { ...rest, top_apps: serp };
});
const serps = Object.fromEntries([...topAppsBySerp.values()].map((apps, index) => [`serp_${index + 1}`, apps]));
const unknownSerp = "serp_1";

client.close();
ctx.store.close();

// ---------- write ----------

mkdirSync(MOCKS, { recursive: true });
mkdirSync(NEW_APP_MOCKS, { recursive: true });

writeFileSync(join(MOCKS, "_tools.json"), json(tools) + "\n");

writeFileSync(join(MOCKS, "app.md"), `---
type: fixed
---
${json(app)}
`);

writeFileSync(join(MOCKS, "reviews.md"), `---
type: fixed
---
${json(reviews)}
`);

writeFileSync(join(MOCKS, "track.md"), `---
type: fixed
expect:
  action: [add, remove, list]
---
{
  "action": "{{input.action}}",
  "result": "Tracking list updated. Tracked keywords and apps are checked by the daily run (open-aso track run).",
  "notes": ["Tracking is free. Run the rankings tool (or \`open-aso track run\` on a schedule) to record positions."],
  "cost_usd": 0,
  "cached": false,
  "spend_today_usd": 0
}
`);

const agentPreamble = `You are the open-aso MCP server in a test harness. Answer every call with ONLY a JSON object,
no prose and no code fences, in exactly the shape of the recorded responses below. Never invent
fields. These responses were recorded from the real open-aso tools.`;

function keywordsMock(ownRanks: boolean) {
  const rows = ownRanks ? rowsCompact : rowsCompact.map((row) => ({ ...row, your_position: null }));
  return `---
type: agent
abort_when: Never abort.
---
${agentPreamble}

The user's own app is ${ownRanks ? "Telegram Messenger (app id 686449807)" : "a new app with no App Store listing yet, so `your_position` is always null"}.

## Mode 1: \`keywords\` called WITHOUT a \`keywords\` array

${ownRanks ? `Return this recorded response verbatim (if \`limit\` is below the number of rows, keep only the first \`limit\` rows, and set cost_usd to the same value):

${json(keywordsMode1)}` : `Return: {"error": "No App Store listing found for your app yet. Use keywords mode 2 with candidate keywords."}`}

## Mode 2: \`keywords\` called WITH a \`keywords\` array

Return \`{"keywords": [...], "notes": [...], "cost_usd": ..., "cached": false, "spend_today_usd": ...}\`.

- Lower-case and de-duplicate the requested keywords; answer at most the first 25, in the order given.
- For each keyword, take its row from the table below and replace \`top_apps\` with the list named there.
- A keyword not in the table gets: \`search_volume: null\`, \`difficulty: 55\`, \`difficulty_tier: "Moderate"\`,
  \`your_position: null\`, and \`top_apps\` from ${unknownSerp}.
- If \`with_volume\` is false, leave out the \`search_volume\` field entirely.
- \`cost_usd\` = number of keywords answered x ${costWithVolume} (or x ${costWithoutVolume} when \`with_volume\` is false), rounded to 4 decimals.
- \`spend_today_usd\` = previous spend_today_usd you returned (start at 0) plus this cost_usd.
- \`notes\` is always: ${compact(mode2Notes)}

Rows (one JSON object per line):
${rows.map((row) => compact(row)).join("\n")}

Top app lists:
${json(serps)}
`;
}

writeFileSync(join(MOCKS, "keywords.md"), keywordsMock(true));
writeFileSync(join(NEW_APP_MOCKS, "keywords.md"), keywordsMock(false));

writeFileSync(join(MOCKS, "competitors.md"), `---
type: agent
abort_when: Never abort.
---
${agentPreamble}

## \`competitors\` called WITHOUT \`competitor\`

Return this recorded response verbatim (if \`limit\` is smaller, keep only the first \`limit\` competitors):

${json(competitorList)}

## \`competitors\` called WITH \`competitor\`

Return this recorded keyword-gap response, but replace the \`competitor\` object with the app the caller
named: use the matching app_id and title from the competitor list above when the name, link or id
matches one; otherwise keep the recorded competitor. Keep every row and value exactly as recorded.

${json(keywordGap)}
`);

const positions = Object.fromEntries(mode2Rows.map((row) => [row.keyword, row.your_position]));
const leaders = Object.fromEntries(mode2Rows.map((row) => [row.keyword, (row.top_apps as unknown[])[0]]));
writeFileSync(join(MOCKS, "rankings.md"), `---
type: agent
abort_when: Never abort.
---
${agentPreamble}

\`rankings\` returns where the user's app, Telegram Messenger (686449807), ranks for each keyword:

{"app": {"app_id": "686449807", "title": "Telegram Messenger", "developer": "Telegram FZ-LLC"},
 "rankings": [{"keyword": "...", "position": <number|null>, "previous_position": null, "change": null, "leader": {...}}],
 "notes": ["position is the rank in US App Store search (top 100). null = not in the top 100.",
           "change is positive when the app moved up since the previous saved check."],
 "cost_usd": <keywords x 0.0024, 4 decimals>, "cached": false, "spend_today_usd": <running total>}

- Use the \`keywords\` argument (lower-cased, max 25). If it's missing, use the keywords the caller added
  with \`track\` earlier in this session; if there are none, return
  {"error": "No keywords given and none are tracked yet. Pass keywords, or add some with the track tool."}.
- Positions (null = not in the top 100). Keywords not listed here are null:
${compact(positions)}
- Leaders (\`leader\` field) by keyword; for other keywords use the "messenger" leader:
${compact(leaders)}
`);

const examples = [
  { title: "Telegram Messenger: Secure Chat & Messaging App", subtitle: "Fast, private messages", keywords: "chat, messages, group, video call, apps" },
  { title: "Telegram: Secure Messenger", subtitle: "Private group chat and calls", keywords: "encrypted,messaging,video,voice,text,channel,sticker,file,sharing,cloud,friends,family,secret,bots,fast" },
].map((input) => ({ input, output: validateMetadata(input) }));

writeFileSync(join(MOCKS, "validate_metadata.md"), `---
type: agent
abort_when: Never abort.
---
${agentPreamble}

You are open-aso's \`validate_metadata\` tool, a deterministic checker. Apply these rules EXACTLY as
the code does (src/metadata/validate.ts). Count characters precisely, one by one, including spaces
and punctuation; Unicode characters count as one each.

Inputs: \`title\` (required), \`subtitle\` and \`keywords\` (optional; missing means "").
Limits: title ${LIMITS.title}, subtitle ${LIMITS.subtitle}, keyword field ${LIMITS.keywords}.

Definitions:
- terms = keyword field split on ",", each trimmed, empties dropped.
- words(text) = lower-cased text split on any run of characters that are not letters, digits or
  apostrophes, keeping only pieces longer than 1 character.
- FILLER = app, apps, the, and, a, an, of, for, with, iphone, ipad, free.

Checks, in this order (id, severity, ok when, message):
1. title_length (error): 0 < title length <= 30. Message "Title is empty." if empty, else
   "Title is N/30 characters." plus " Cut at least K." when over.
2. subtitle_length (error): length <= 30. "Subtitle is N/30 characters." (+ " Cut at least K.").
3. keywords_length (error): length <= 100. "Keyword field is N/100 characters." (+ " Cut at least K.").
4. keywords_no_spaces_after_commas (warning): no comma followed by whitespace. Failing message:
   "Remove spaces after commas to free up S characters." Passing: "No wasted spaces after commas."
5. keywords_no_duplicates (warning): no term repeated (case-insensitive). "Repeated in keyword field: x, y."
6. no_repeats_across_fields (warning): no non-filler word shared by title and subtitle, and no
   non-filler word of title or subtitle appearing among words of the terms. Failing message:
   "Apple indexes all fields together, so these words are wasted repeats: a, b."
7. no_plural_duplicates (warning): across all words of title, subtitle and terms, no word w where
   w+"s" or w+"es" is also present. "Apple matches singular and plural forms; keep one of: w/ws."
8. keywords_no_filler (warning): no FILLER word among the words of the terms.
   "Filler words that waste keyword space: x."
9. keywords_no_special_characters (warning): keyword field only has letters, digits, commas,
   whitespace, apostrophes, &, ., + and -.
10. keywords_fill_space (warning): keyword field empty, or 100 - length <= 10. Failing message:
   "U keyword characters unused; add more terms."

Return {"valid": <true when no error-severity check fails>, "counts": {...}, "limits": {"title": 30,
"subtitle": 30, "keywords": 100}, "checks": [10 checks with id, severity, ok, message],
"cost_usd": 0, "cached": false, "spend_today_usd": <the latest spend_today_usd from other tools, or 0>}.

Two calls and the real tool's answers, for calibration:
${examples.map(({ input, output }) => `Input: ${compact(input)}\nOutput: ${compact({ ...output, cost_usd: 0, cached: false, spend_today_usd: 0 })}`).join("\n\n")}
`);

console.log(`Recorded ${tools.tools.length} tools, ${mode2Rows.length} mode-2 keywords (${costWithVolume}/keyword) into ${MOCKS}`);
