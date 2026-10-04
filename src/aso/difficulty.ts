// Keyword difficulty (1-100): how hard it is to break into the top 10 for a
// keyword, estimated from who is already there. Open and deliberately simple so
// users and agents can reason about it.
//
//   50%  Rating volume:  median log10(rating count) of the top 10, scaled so
//                        1M+ ratings = max. Big, established apps are hard to pass.
//   25%  Title targeting: share of the top 10 with every keyword word in their
//                        title. Competitors who target the keyword directly are harder.
//   15%  Rating quality: average star rating of the top 10.
//   10%  Giants:         share of the top 10 with 100k+ ratings.

import type { RankedApp } from "../core/types.js";

export type DifficultyTier = "Very easy" | "Easy" | "Moderate" | "Hard" | "Very hard";

export interface Difficulty {
  score: number;
  tier: DifficultyTier;
  /** The inputs, so an agent can explain the score. */
  factors: {
    medianRatingCount: number;
    titleMatchShare: number;
    averageRating: number;
    giantsShare: number;
  };
}

export function keywordDifficulty(keyword: string, results: RankedApp[]): Difficulty {
  const top = [...results].sort((a, b) => a.position - b.position).slice(0, 10);
  if (top.length === 0) {
    return { score: 1, tier: "Very easy", factors: { medianRatingCount: 0, titleMatchShare: 0, averageRating: 0, giantsShare: 0 } };
  }

  const counts = top.map((app) => app.ratingCount ?? 0);
  const medianRatingCount = median(counts);
  const volume = Math.min(Math.log10(medianRatingCount + 1) / 6, 1);

  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  const titleMatchShare = top.filter((app) => words.every((word) => app.title.toLowerCase().includes(word))).length / top.length;

  const rated = top.filter((app) => app.rating);
  const averageRating = rated.length ? rated.reduce((sum, app) => sum + (app.rating ?? 0), 0) / rated.length : 0;

  const giantsShare = counts.filter((count) => count >= 100_000).length / top.length;

  const raw = 0.5 * volume + 0.25 * titleMatchShare + 0.15 * (averageRating / 5) + 0.1 * giantsShare;
  const score = Math.max(1, Math.min(100, Math.round(raw * 100)));

  return {
    score,
    tier: tierFor(score),
    factors: {
      medianRatingCount: Math.round(medianRatingCount),
      titleMatchShare: round2(titleMatchShare),
      averageRating: round2(averageRating),
      giantsShare: round2(giantsShare),
    },
  };
}

function tierFor(score: number): DifficultyTier {
  if (score < 20) return "Very easy";
  if (score < 40) return "Easy";
  if (score < 60) return "Moderate";
  if (score < 80) return "Hard";
  return "Very hard";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
