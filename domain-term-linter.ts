// ─────────────────────────────────────────────────────────────────────────────
// File: package.json
// ─────────────────────────────────────────────────────────────────────────────
{
  "name": "mcp-arch",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "bin": {
    "mcp-arch": "dist/index.js",
    "mcp-arch-cli": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p .",
    "dev": "ts-node --esm src/index.ts",
    "dev:cli": "ts-node --esm src/cli.ts",
    "lint": "eslint . --ext .ts",
    "test": "node --test"
  },
  "dependencies": {
    "zod": "^3.23.8",
    "fast-glob": "^3.3.2"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "ts-node": "^10.9.2",
    "@types/node": "^20.14.12",
    "eslint": "^9.11.0",
    "@typescript-eslint/eslint-plugin": "^8.7.0",
    "@typescript-eslint/parser": "^8.7.0"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File: tsconfig.json
// ─────────────────────────────────────────────────────────────────────────────
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}

// ─────────────────────────────────────────────────────────────────────────────
// File: src/types.ts
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";

export const LintAutoMap = z.record(z.string(), z.string());
export type T_LintAutoMap = z.infer<typeof LintAutoMap>;

export const LintRulesSchema = z.object({
  ids: z.object({
    disallow_hyphen: z.boolean().default(true),
    require_snake_case: z.boolean().default(true),
    forbid_accents: z.boolean().default(true),
    auto_map: LintAutoMap.default({})
  }),
  values: z.object({
    enum_normalization: z.record(z.string(), z.record(z.string(), z.string())).default({})
  }).default({}),
  geo: z.object({
    canonical: z.string().default("code_insee_commune"),
    fallbacks: z.array(z.string()).default(["code_postal"]),
    ui_autocomplete_function: z.string().optional(),
    require_insee_on_submit: z.boolean().default(true)
  }).default({}),
  dates: z.object({
    ui_format_hint: z.string().default("jj/mm/aaaa"),
    storage_format: z.string().default("YYYY-MM-DD"),
    normalize_input: z.boolean().default(true)
  }).default({}),
  money: z.object({
    default_period: z.string().default("mensuel"),
    twelve_month_suffix: z.string().default("_12m_eur"),
    require_unit_eur: z.boolean().default(true),
    min_zero: z.boolean().default(true)
  }).default({}),
  arrays: z.object({
    exclusive_values: z.record(z.string(), z.string()).default({})
  }).default({})
});
export type T_LintRules = z.infer<typeof LintRulesSchema>;

export const LintInput = z.object({
  repoPath: z.string(),
  globs: z.array(z.string()).default(["**/*.json", "**/*.yaml"]),
  rules: LintRulesSchema,
});
export type T_LintInput = z.infer<typeof LintInput>;

export const LintViolation = z.object({
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  kind: z.enum([
    "id-hyphen",
    "id-not-snake",
    "id-has-accents",
    "id-auto-map",
    "enum-needs-normalization",
    "geo-missing-insee",
    "money-negative"
  ]),
  message: z.string(),
  suggestion: z.string().optional(),
  path: z.string().optional() // JSON path like $.steps[1].questions[0].id
});
export type T_LintViolation = z.infer<typeof LintViolation>;

export const LintResult = z.object({
  summary: z.string(),
  violations: z.array(LintViolation)
});
export type T_LintResult = z.infer<typeof LintResult>;

// ─────────────────────────────────────────────────────────────────────────────
// File: src/utils/fs.ts
// ─────────────────────────────────────────────────────────────────────────────
import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadFiles(root: string, patterns: string[]): Promise<{path: string, content: string}[]> {
  const entries = await fg(patterns, { cwd: root, dot: true, onlyFiles: true });
  const results: {path: string, content: string}[] = [];
  for (const rel of entries) {
    const full = path.join(root, rel);
    try {
      const content = await readFile(full, "utf8");
      results.push({ path: rel, content });
    } catch {}
  }
  return results;
}

export function tryParseJson(text: string): unknown | undefined {
  try { return JSON.parse(text); } catch { return undefined; }
}

// ─────────────────────────────────────────────────────────────────────────────
// File: src/tools/domainTermLinter.ts
// ─────────────────────────────────────────────────────────────────────────────
import { T_LintInput, T_LintResult, T_LintViolation } from "../types.js";
import { loadFiles, tryParseJson } from "../utils/fs.js";

const ACCENTS = /[À-ÖØ-öø-ÿ]/u;
const SNAKE = /^[a-z][a-z0-9_]*$/;

function toSnakeCase(id: string) {
  // convert hyphens to underscores, strip accents (simple map), lower-case
  const withoutAccents = id.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return withoutAccents.replace(/-/g, "_").replace(/\s+/g, "_").toLowerCase();
}

function findIds(obj: any, basePath = "$", acc: {path: string, id: string}[] = []) {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findIds(v, `${basePath}[${i}]`, acc));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const p = `${basePath}.${k}`;
      if (k === "id" && typeof v === "string") {
        acc.push({ path: p, id: v });
      }
      findIds(v, p, acc);
    }
  }
  return acc;
}

function* walkNumbers(obj: any, basePath = "$", keys: string[] = []) : Generator<{path:string, value:number}> {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) yield* walkNumbers(obj[i], `${basePath}[${i}]`, keys);
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const p = `${basePath}.${k}`;
      if (typeof v === "number") {
        yield { path: p, value: v };
      }
      yield* walkNumbers(v, p, keys);
    }
  }
}

export async function domainTermLinter(input: T_LintInput): Promise<T_LintResult> {
  const { repoPath, globs, rules } = input;
  const files = await loadFiles(repoPath, globs);
  const violations: T_LintViolation[] = [];

  for (const f of files) {
    const asJson = tryParseJson(f.content);
    if (!asJson) continue; // YAML and others: extend later
    const ids = findIds(asJson);

    for (const it of ids) {
      const id = it.id as string;
      if (rules.ids.disallow_hyphen && id.includes("-")) {
        const suggestion = toSnakeCase(id);
        violations.push({ file: f.path, kind: "id-hyphen", message: `ID contient un tiret: ${id}`, suggestion, path: it.path });
      }
      if (rules.ids.forbid_accents && ACCENTS.test(id)) {
        const suggestion = toSnakeCase(id);
        violations.push({ file: f.path, kind: "id-has-accents", message: `ID contient un accent: ${id}`, suggestion, path: it.path });
      }
      if (rules.ids.require_snake_case && !SNAKE.test(id)) {
        const suggestion = toSnakeCase(id);
        violations.push({ file: f.path, kind: "id-not-snake", message: `ID non snake_case: ${id}`, suggestion, path: it.path });
      }
      if (rules.ids.auto_map[id]) {
        violations.push({ file: f.path, kind: "id-auto-map", message: `ID à remapper: ${id} → ${rules.ids.auto_map[id]}`, suggestion: rules.ids.auto_map[id], path: it.path });
      }
    }

    // Money checks: negative numbers
    if (rules.money.min_zero) {
      for (const n of walkNumbers(asJson)) {
        if (n.value < 0) {
          violations.push({ file: f.path, kind: "money-negative", message: `Valeur négative à ${n.path}: ${n.value}` });
        }
      }
    }

    // Enum normalization (values → slugs). Look for "choices[].id" and normalize content strings.
    const choices = findIds(asJson).filter(x => /choices\[\d+\]\.id$/.test(x.path));
    for (const c of choices) {
      const raw = c.id;
      for (const [field, mapping] of Object.entries(rules.values.enum_normalization)) {
        // if current raw matches any verbose key, propose normalized value
        if (mapping[raw]) {
          violations.push({ file: f.path, kind: "enum-needs-normalization", message: `Normaliser valeur '${raw}' pour ${field} → ${mapping[raw]}`, suggestion: mapping[raw], path: c.path });
        }
      }
    }

    // Geo rule: if field suggests commune by postal code only, hint INSEE
    if (f.content.includes("getInseeNumber") && rules.geo.require_insee_on_submit) {
      violations.push({ file: f.path, kind: "geo-missing-insee", message: "Exiger code INSEE en soumission (postal en fallback)", suggestion: "code_insee_commune" });
    }
  }

  const summary = `${violations.length} violation(s) sur ${files.length} fichier(s)`;
  return { summary, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// File: src/mcp/stdioJsonRpc.ts (tiny JSON-RPC over stdio used by MCP clients)
// ─────────────────────────────────────────────────────────────────────────────
import { stdin as input, stdout as output } from "node:process";

export type RpcHandler = (method: string, params: any) => Promise<any>;

export async function runJsonRpc(handler: RpcHandler) {
  let buffer = "";
  input.setEncoding("utf8");
  input.on("data", async (chunk) => {
    buffer += chunk;
    // naive framing: expect one JSON per line
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx); buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const res = await handler(msg.method, msg.params);
        output.write(JSON.stringify({ id: msg.id, result: res }) + "\n");
      } catch (e: any) {
        output.write(JSON.stringify({ error: { message: e?.message || String(e) } }) + "\n");
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// File: src/index.ts (MCP tool shim via JSON-RPC over stdio)
// ─────────────────────────────────────────────────────────────────────────────
import { runJsonRpc } from "./mcp/stdioJsonRpc.js";
import { domainTermLinter } from "./tools/domainTermLinter.js";
import { LintInput } from "./types.js";

// This is a minimal shim compatible with MCP-style tool calling via stdio JSON-RPC.
// Your MCP-capable client can invoke method names like "tools/domain_term_linter".

runJsonRpc(async (method, params) => {
  if (method === "tools/domain_term_linter") {
    const parsed = LintInput.parse(params);
    return await domainTermLinter(parsed);
  }
  throw new Error(`Unknown method: ${method}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// File: src/cli.ts (local CLI for CI runs and testing outside MCP)
// ─────────────────────────────────────────────────────────────────────────────
import { readFile } from "node:fs/promises";
import path from "node:path";
import { domainTermLinter } from "./tools/domainTermLinter.js";
import { LintRulesSchema } from "./types.js";

async function main() {
  const repoPath = process.argv[2] || process.cwd();
  const rulesPath = process.argv[3] || path.join(process.cwd(), "tools/lint/domain-rules.json");
  const rules = LintRulesSchema.parse(JSON.parse(await readFile(rulesPath, "utf8")));
  const result = await domainTermLinter({ repoPath, globs: ["**/*.json"], rules });
  if (result.violations.length) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log("OK: no violations");
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
