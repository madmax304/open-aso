import { describe, expect, it } from "vitest";
import {
  encode,
  parseDataForSeoCredentials,
  resolveDataForSeoCredentials,
} from "../src/data/dataforseo/credentials.js";

const email = "dev@example.com";
const apiKey = "a1b2c3d4e5f6g7h8";
const base64 = encode(email, apiKey);

describe("resolveDataForSeoCredentials", () => {
  it("option A: email + API key", () => {
    expect(resolveDataForSeoCredentials({ email, apiKey })).toEqual({ ok: true, key: base64 });
  });

  it("option B: Base64 alone", () => {
    expect(resolveDataForSeoCredentials({ base64 })).toEqual({ ok: true, key: base64 });
  });

  it("all three filled in and matching", () => {
    expect(resolveDataForSeoCredentials({ email, apiKey, base64 })).toEqual({ ok: true, key: base64 });
  });

  it("all three filled in but not matching", () => {
    const r = resolveDataForSeoCredentials({ email, apiKey: "different-key-123", base64 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/don't match/);
  });

  it("Base64 pasted into the API key field", () => {
    expect(resolveDataForSeoCredentials({ apiKey: base64 })).toEqual({ ok: true, key: base64 });
  });

  it("Base64 pasted into the API key field alongside the email", () => {
    expect(resolveDataForSeoCredentials({ email, apiKey: base64 })).toEqual({ ok: true, key: base64 });
  });

  it("explains what's missing", () => {
    const noKey = resolveDataForSeoCredentials({ email });
    const noEmail = resolveDataForSeoCredentials({ apiKey });
    const nothing = resolveDataForSeoCredentials({});
    expect(noKey.ok || noKey.error).toMatch(/Missing your API key/);
    expect(noEmail.ok || noEmail.error).toMatch(/Missing the email/);
    expect(nothing.ok || nothing.error).toMatch(/No DataForSEO credentials/);
  });

  it("rejects a malformed Base64 value", () => {
    const r = resolveDataForSeoCredentials({ base64: "not-really-base64" });
    expect(r.ok).toBe(false);
  });

  it("trims whitespace", () => {
    expect(resolveDataForSeoCredentials({ email: ` ${email} `, apiKey: `${apiKey}\n` })).toEqual({ ok: true, key: base64 });
  });
});

describe("parseDataForSeoCredentials (free-form paste, for init/UI)", () => {
  it("accepts the Base64 key as-is", () => {
    expect(parseDataForSeoCredentials(`  ${base64}\n`)).toBe(base64);
  });

  it("accepts email:apiKey", () => {
    expect(parseDataForSeoCredentials(`${email}:${apiKey}`)).toBe(base64);
  });

  it("accepts a pasted email body with labelled fields", () => {
    const body = `Hello,\n\nHere are your API credentials.\nAPI login: ${email}\nAPI password: ${apiKey}\n\nThanks, DataForSEO`;
    expect(parseDataForSeoCredentials(body)).toBe(base64);
  });

  it("returns null when nothing usable is pasted", () => {
    expect(parseDataForSeoCredentials("")).toBeNull();
    expect(parseDataForSeoCredentials("hello world")).toBeNull();
    expect(parseDataForSeoCredentials(email)).toBeNull();
  });
});
