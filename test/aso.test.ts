import { describe, expect, it } from "vitest";
import { keywordDifficulty } from "../src/aso/difficulty.js";
import { validateMetadata } from "../src/metadata/validate.js";
import type { RankedApp } from "../src/core/types.js";

const app = (position: number, title: string, ratingCount: number, rating = 4.5): RankedApp => ({
  appId: String(position), title, position, ratingCount, rating,
});

describe("keywordDifficulty", () => {
  it("scores a keyword owned by giants as very hard", () => {
    const top = Array.from({ length: 10 }, (_, i) => app(i + 1, `Messenger ${i}`, 5_000_000, 4.7));
    const d = keywordDifficulty("messenger", top);
    expect(d.score).toBeGreaterThanOrEqual(80);
    expect(d.tier).toBe("Very hard");
  });

  it("scores a keyword with small, untargeted apps as easy", () => {
    const top = Array.from({ length: 10 }, (_, i) => app(i + 1, `Some App ${i}`, 40, 3.5));
    const d = keywordDifficulty("pregnancy journal", top);
    expect(d.score).toBeLessThan(40);
    expect(d.factors.titleMatchShare).toBe(0);
  });

  it("handles empty results", () => {
    expect(keywordDifficulty("nothing", []).score).toBe(1);
  });
});

describe("validateMetadata", () => {
  it("passes clean metadata", () => {
    const r = validateMetadata({
      title: "Natal: Pregnancy Tracker",
      subtitle: "Baby bump week by week",
      keywords: "postpartum,newborn,due,date,calculator,contraction,timer,kick,counter,mom,expecting,trimester,birth",
    });
    expect(r.valid).toBe(true);
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("flags length errors", () => {
    const r = validateMetadata({ title: "A".repeat(31) });
    expect(r.valid).toBe(false);
    expect(r.checks.find((c) => c.id === "title_length")!.ok).toBe(false);
  });

  it("flags wasted characters and repeats", () => {
    const r = validateMetadata({
      title: "Habit Tracker",
      subtitle: "Daily habit goals",
      keywords: "habit, tracker, goal, goals, app, routine, routine",
    });
    const failed = Object.fromEntries(r.checks.filter((c) => !c.ok).map((c) => [c.id, c.message]));
    expect(r.valid).toBe(true); // warnings only
    expect(failed.keywords_no_spaces_after_commas).toMatch(/free up 6 characters/);
    expect(failed.no_repeats_across_fields).toMatch(/habit/);
    expect(failed.no_plural_duplicates).toMatch(/goal\/goals/);
    expect(failed.keywords_no_filler).toMatch(/app/);
    expect(failed.keywords_no_duplicates).toMatch(/routine/);
  });
});
