// Phase 0 data spike: hit every DataForSEO endpoint open-aso v0.1 needs,
// print what it returns and costs, and save each raw response as a test fixture.
//
//   Fill in your DataForSEO credentials in .env (see .env.example)
//   npm run spike -- --app 1234567890 --competitor 2345678901 --keywords "habit tracker,daily habits"
//
// Expected total cost: under $0.10 (well inside DataForSEO's $1 free credit).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DataForSeoClient, DataForSeoError } from "../src/data/dataforseo/client.js";
import { dataForSeoKeyFromEnv } from "../src/core/config.js";

const FIXTURES = join(import.meta.dirname, "..", "test", "fixtures", "dataforseo");
const US = { location_code: 2840, language_code: "en" };
const HIGH_PRIORITY = 2; // ~1 min instead of ~45 min, 2x price (still fractions of a cent)

loadDotEnv();

const { values: args } = parseArgs({
  options: {
    // Defaults are DataForSEO's own doc examples; pass your own app for a real test.
    app: { type: "string", default: "686449807" },
    competitor: { type: "string", default: "382617920" },
    keywords: { type: "string", default: "messenger,chat app" },
  },
});

let apiKey: string | null;
try {
  apiKey = dataForSeoKeyFromEnv();
} catch (error) {
  console.error(`DataForSEO credentials in .env: ${(error as Error).message}`);
  process.exit(1);
}
if (!apiKey) {
  console.error("Missing DataForSEO credentials. Fill in .env (see the instructions at the top of .env.example).");
  process.exit(1);
}

const client = new DataForSeoClient({ apiKey });
const appId = args.app!;
const competitorId = args.competitor!;
const keywords = args.keywords!.split(",").map((k) => k.trim()).filter(Boolean);
const costs: Array<{ step: string; costUsd: number; seconds: number }> = [];

mkdirSync(FIXTURES, { recursive: true });

console.log(`\nopen-aso data spike: app ${appId}, competitor ${competitorId}, keywords: ${keywords.join(", ")}\n`);

// 1. Account balance (free)
await step("user_data", "Account balance", async () => {
  const r = await client.live<any>("/v3/appendix/user_data");
  console.log(`   balance: $${r.result?.money?.balance ?? "?"}`);
  return r;
});

// 2. Keywords the app ranks for, with volume (Labs, live)
await step("labs_keywords_for_app", "Keywords for app (Labs)", async () => {
  const r = await client.live<any>("/v3/dataforseo_labs/apple/keywords_for_app/live", {
    app_id: appId, ...US, limit: 50,
  });
  const items: any[] = r.result?.items ?? [];
  console.log(`   ${r.result?.total_count ?? items.length} keywords total, showing top 10 by order returned:`);
  for (const item of items.slice(0, 10)) console.log(`   - ${summarize(item)}`);
  return r;
});

// 3. Competitors (Labs, live)
await step("labs_app_competitors", "App competitors (Labs)", async () => {
  const r = await client.live<any>("/v3/dataforseo_labs/apple/app_competitors/live", {
    app_id: appId, ...US, limit: 10,
  });
  for (const item of (r.result?.items ?? []).slice(0, 10)) console.log(`   - ${summarize(item)}`);
  return r;
});

// 4. Keyword gap vs. competitor (Labs, live)
await step("labs_app_intersection", "Keyword gap (Labs)", async () => {
  const r = await client.live<any>("/v3/dataforseo_labs/apple/app_intersection/live", {
    app_ids: { "1": appId, "2": competitorId }, ...US, limit: 20,
  });
  for (const item of (r.result?.items ?? []).slice(0, 10)) console.log(`   - ${summarize(item)}`);
  return r;
});

// 5. App Store search results per keyword (App Data, queued) -> rank check
for (const [i, keyword] of keywords.entries()) {
  await step(`app_searches_${i + 1}`, `Search results for "${keyword}"`, async () => {
    const r = await client.task<any>("/v3/app_data/apple/app_searches", {
      keyword, ...US, depth: 100, priority: HIGH_PRIORITY,
    });
    const items: any[] = r.result?.items ?? [];
    const ours = items.find((item) => String(item.app_id) === appId);
    console.log(`   ${items.length} results. Your app: ${ours ? `#${ours.rank_absolute ?? ours.rank_group ?? "?"}` : "not in top 100"}`);
    for (const item of items.slice(0, 5)) console.log(`   - ${summarize(item)}`);
    console.log(`   >> Compare with a real App Store search for "${keyword}" on a US account.`);
    return r;
  });
}

// 6. App listing details (App Data, queued)
await step("app_info", "App listing details", async () => {
  const r = await client.task<any>("/v3/app_data/apple/app_info", {
    app_id: appId, ...US, priority: HIGH_PRIORITY,
  });
  const item = r.result?.items?.[0] ?? r.result;
  console.log(`   ${summarize(item)}`);
  return r;
});

// 7. Reviews (App Data, queued)
await step("app_reviews", "Recent reviews", async () => {
  const r = await client.task<any>("/v3/app_data/apple/app_reviews", {
    app_id: appId, ...US, depth: 50, priority: HIGH_PRIORITY,
  });
  const items: any[] = r.result?.items ?? [];
  console.log(`   ${items.length} reviews fetched`);
  for (const item of items.slice(0, 3)) console.log(`   - ${summarize(item)}`);
  return r;
});

// Summary
const total = costs.reduce((sum, c) => sum + c.costUsd, 0);
console.log("\n=== Cost summary ===");
for (const c of costs) {
  console.log(`  ${c.step.padEnd(24)} $${c.costUsd.toFixed(5)}   ${c.seconds.toFixed(1)}s`);
}
console.log(`  ${"TOTAL".padEnd(24)} $${total.toFixed(5)}`);
console.log(`\nFixtures saved to test/fixtures/dataforseo/. Check them for anything sensitive before committing.\n`);

// --- helpers ---

async function step(name: string, label: string, run: () => Promise<{ costUsd: number; raw: unknown }>) {
  console.log(`▶ ${label}`);
  const started = Date.now();
  try {
    const r = await run();
    const seconds = (Date.now() - started) / 1000;
    costs.push({ step: name, costUsd: r.costUsd, seconds });
    // user_data contains account details (login, balance): never save it as a fixture.
    if (name !== "user_data") {
      writeFileSync(join(FIXTURES, `${name}.json`), JSON.stringify(r.raw, null, 2) + "\n");
    }
    console.log(`   cost $${r.costUsd.toFixed(5)}, ${seconds.toFixed(1)}s\n`);
  } catch (error) {
    const seconds = (Date.now() - started) / 1000;
    if (error instanceof DataForSeoError) {
      costs.push({ step: `${name} (failed)`, costUsd: error.costUsd, seconds });
      console.log(`   ✗ DataForSEO ${error.statusCode}: ${error.message}\n`);
    } else {
      throw error;
    }
  }
}

/** One-line summary of an unknown DataForSEO item: pick the fields we care about. */
function summarize(item: any): string {
  if (!item) return "(empty)";
  const pick = (...keys: string[]) => keys.map((k) => item[k] ?? item.keyword_data?.[k] ?? item.keyword_info?.[k]).find((v) => v != null);
  const parts = [
    pick("rank_absolute", "rank_group", "position") != null ? `#${pick("rank_absolute", "rank_group", "position")}` : null,
    pick("keyword"),
    pick("title"),
    pick("search_volume") != null ? `vol ${pick("search_volume")}` : null,
    pick("app_id") != null ? `id ${pick("app_id")}` : null,
    item.rating?.value != null ? `★${item.rating.value}` : null,
    item.rating?.votes_count != null ? `(${item.rating.votes_count} ratings)` : null,
    pick("review_text") ? String(pick("review_text")).slice(0, 60) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : JSON.stringify(item).slice(0, 120);
}

function loadDotEnv() {
  const path = join(import.meta.dirname, "..", ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]!]) process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
}
