// validate_metadata: checks App Store title, subtitle and keyword field against
// Apple's limits and common ASO mistakes. Pure and offline, so agents can loop
// write -> validate -> fix for free.
//
// Apple indexes title + subtitle + keyword field together, so repeating a word
// across them wastes characters.

export interface MetadataInput {
  title: string;
  subtitle?: string;
  /** The 100-character keyword field, comma-separated. */
  keywords?: string;
}

export interface Check {
  id: string;
  /** "error" breaks Apple's rules; "warning" wastes space or hurts ranking. */
  severity: "error" | "warning";
  ok: boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  counts: { title: number; subtitle: number; keywords: number };
  limits: { title: number; subtitle: number; keywords: number };
  checks: Check[];
}

export const LIMITS = { title: 30, subtitle: 30, keywords: 100 } as const;

/** Words Apple already matches or that add nothing in the keyword field. */
const FILLER = new Set(["app", "apps", "the", "and", "a", "an", "of", "for", "with", "iphone", "ipad", "free"]);

export function validateMetadata(input: MetadataInput): ValidationResult {
  const title = input.title ?? "";
  const subtitle = input.subtitle ?? "";
  const keywordField = input.keywords ?? "";
  const counts = { title: [...title].length, subtitle: [...subtitle].length, keywords: [...keywordField].length };
  const checks: Check[] = [];
  const add = (id: string, severity: Check["severity"], ok: boolean, message: string) => checks.push({ id, severity, ok, message });

  const lengthMessage = (field: string, count: number, limit: number) =>
    `${field} is ${count}/${limit} characters.${count > limit ? ` Cut at least ${count - limit}.` : ""}`;
  add("title_length", "error", counts.title <= LIMITS.title && counts.title > 0,
    counts.title === 0 ? "Title is empty." : lengthMessage("Title", counts.title, LIMITS.title));
  add("subtitle_length", "error", counts.subtitle <= LIMITS.subtitle, lengthMessage("Subtitle", counts.subtitle, LIMITS.subtitle));
  add("keywords_length", "error", counts.keywords <= LIMITS.keywords, lengthMessage("Keyword field", counts.keywords, LIMITS.keywords));

  const terms = keywordField.split(",").map((term) => term.trim()).filter(Boolean);

  add("keywords_no_spaces_after_commas", "warning", !/,\s/.test(keywordField),
    /,\s/.test(keywordField)
      ? `Remove spaces after commas to free up ${(keywordField.match(/,\s+/g) ?? []).reduce((n, m) => n + m.length - 1, 0)} characters.`
      : "No wasted spaces after commas.");

  const duplicateTerms = duplicates(terms.map((term) => term.toLowerCase()));
  add("keywords_no_duplicates", "warning", duplicateTerms.length === 0,
    duplicateTerms.length ? `Repeated in keyword field: ${duplicateTerms.join(", ")}.` : "No repeated keywords.");

  const titleWords = words(title);
  const subtitleWords = words(subtitle);
  const keywordWords = terms.flatMap(words);
  const overlapTitleSubtitle = intersect(titleWords, subtitleWords);
  const overlapWithKeywords = intersect([...titleWords, ...subtitleWords], keywordWords);
  add("no_repeats_across_fields", "warning", overlapTitleSubtitle.length === 0 && overlapWithKeywords.length === 0,
    overlapTitleSubtitle.length || overlapWithKeywords.length
      ? `Apple indexes all fields together, so these words are wasted repeats: ${[...new Set([...overlapTitleSubtitle, ...overlapWithKeywords])].join(", ")}.`
      : "No words repeated across title, subtitle and keyword field.");

  const plurals = pluralPairs([...titleWords, ...subtitleWords, ...keywordWords]);
  add("no_plural_duplicates", "warning", plurals.length === 0,
    plurals.length ? `Apple matches singular and plural forms; keep one of: ${plurals.join(", ")}.` : "No singular/plural duplicates.");

  const filler = [...new Set(keywordWords.filter((word) => FILLER.has(word)))];
  add("keywords_no_filler", "warning", filler.length === 0,
    filler.length ? `Filler words that waste keyword space: ${filler.join(", ")}.` : "No filler words in the keyword field.");

  const special = /[^\p{L}\p{N},\s'&.+-]/u;
  add("keywords_no_special_characters", "warning", !special.test(keywordField),
    special.test(keywordField) ? "Keyword field contains special characters; use letters, numbers and commas." : "No special characters in the keyword field.");

  const unused = LIMITS.keywords - counts.keywords;
  add("keywords_fill_space", "warning", keywordField.length === 0 || unused <= 10,
    keywordField.length && unused > 10 ? `${unused} keyword characters unused; add more terms.` : "Keyword field uses its space well.");

  return {
    valid: checks.every((check) => check.severity !== "error" || check.ok),
    counts,
    limits: { ...LIMITS },
    checks,
  };
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((word) => word.length > 1);
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

function intersect(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return [...new Set(a.filter((word) => set.has(word) && !FILLER.has(word)))];
}

function pluralPairs(all: string[]): string[] {
  const set = new Set(all);
  return [...set].filter((word) => set.has(`${word}s`) || set.has(`${word}es`)).map((word) => `${word}/${set.has(`${word}s`) ? `${word}s` : `${word}es`}`);
}
