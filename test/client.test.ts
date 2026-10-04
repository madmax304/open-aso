import { describe, expect, it } from "vitest";
import { DataForSeoClient, DataForSeoError } from "../src/data/dataforseo/client.js";

// Pattern for all tests: never hit the network. Fake fetch with canned
// responses, or load real responses from test/fixtures/dataforseo/.
function fakeFetch(responses: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

const envelope = (task: object, cost = 0) => ({
  status_code: 20000,
  status_message: "Ok.",
  cost,
  tasks_count: 1,
  tasks_error: 0,
  tasks: [{ id: "t1", cost, result: null, ...task }],
});

const creds = { apiKey: "dXNlcjpwYXNz" };

describe("DataForSeoClient", () => {
  it("returns the first result and cost for live calls", async () => {
    const client = new DataForSeoClient(creds, {
      fetchImpl: fakeFetch([envelope({ status_code: 20000, status_message: "Ok.", result: [{ items: [1, 2] }] }, 0.0132)]),
    });
    const r = await client.live<{ items: number[] }>("/v3/x/live", { app_id: "1" });
    expect(r.result.items).toEqual([1, 2]);
    expect(r.costUsd).toBe(0.0132);
  });

  it("polls queued tasks and bills the task_post cost", async () => {
    const client = new DataForSeoClient(creds, {
      pollIntervalMs: 1,
      fetchImpl: fakeFetch([
        envelope({ status_code: 20100, status_message: "Task Created." }, 0.0024),
        envelope({ status_code: 40602, status_message: "Task In Queue." }),
        envelope({ status_code: 20000, status_message: "Ok.", result: [{ items: ["a"] }] }),
      ]),
    });
    const r = await client.task<{ items: string[] }>("/v3/app_data/apple/app_searches", { keyword: "x" });
    expect(r.result.items).toEqual(["a"]);
    expect(r.costUsd).toBe(0.0024);
  });

  it("throws DataForSeoError on task errors", async () => {
    const client = new DataForSeoClient(creds, {
      fetchImpl: fakeFetch([envelope({ status_code: 40501, status_message: "Invalid Field" })]),
    });
    await expect(client.live("/v3/x/live", {})).rejects.toBeInstanceOf(DataForSeoError);
  });
});
