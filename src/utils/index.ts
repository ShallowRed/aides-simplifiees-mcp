import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Load files matching glob patterns from a root directory
 */
export async function loadFiles(
  root: string,
  patterns: string[]
): Promise<{ path: string; content: string }[]> {
  const entries = await fg(patterns, { cwd: root, dot: true, onlyFiles: true });
  const results: { path: string; content: string }[] = [];

  for (const rel of entries) {
    const full = path.join(root, rel);
    try {
      const content = await readFile(full, "utf8");
      results.push({ path: rel, content });
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

/**
 * Try to parse JSON content, return undefined if invalid
 */
export function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  const withoutAccents = str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return withoutAccents
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Check if a string matches snake_case pattern
 */
export function isSnakeCase(str: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(str);
}

/**
 * Check if string contains accented characters
 */
export function hasAccents(str: string): boolean {
  return /[À-ÖØ-öø-ÿ]/u.test(str);
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 */
export function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

/**
 * Deep find all occurrences of a key in an object
 */
export function findByKey(
  obj: any,
  targetKey: string,
  basePath = "$",
  acc: { path: string; value: any }[] = []
): { path: string; value: any }[] {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findByKey(v, targetKey, `${basePath}[${i}]`, acc));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const p = `${basePath}.${k}`;
      if (k === targetKey) {
        acc.push({ path: p, value: v });
      }
      findByKey(v, targetKey, p, acc);
    }
  }
  return acc;
}

/**
 * Extract all numeric values from an object with their paths
 */
export function* walkNumbers(
  obj: any,
  basePath = "$"
): Generator<{ path: string; value: number }> {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      yield* walkNumbers(obj[i], `${basePath}[${i}]`);
    }
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const p = `${basePath}.${k}`;
      if (typeof v === "number") {
        yield { path: p, value: v };
      }
      yield* walkNumbers(v, p);
    }
  }
}

/**
 * Format timestamp for reports
 */
export function formatTimestamp(): string {
  return new Date().toISOString();
}
