import {
  T_LintInput,
  T_LintResult,
  T_LintViolation,
} from "../types/index.js";
import {
  loadFiles,
  tryParseJson,
  toSnakeCase,
  isSnakeCase,
  hasAccents,
  findByKey,
  walkNumbers,
} from "../utils/index.js";

/**
 * Domain Term Linter - Validates field naming conventions and data consistency
 */
export async function domainTermLinter(
  input: T_LintInput
): Promise<T_LintResult> {
  const { repoPath, globs, rules } = input;
  const files = await loadFiles(repoPath, globs);
  const violations: T_LintViolation[] = [];

  for (const f of files) {
    const asJson = tryParseJson(f.content);
    if (!asJson) continue; // TODO: Add YAML support later

    // Find all ID fields in the JSON
    const ids = findByKey(asJson, "id");

    for (const it of ids) {
      const id = String(it.value);

      // Check for hyphens
      if (rules.ids.disallow_hyphen && id.includes("-")) {
        const suggestion = toSnakeCase(id);
        violations.push({
          file: f.path,
          kind: "id-hyphen",
          message: `ID contient un tiret: ${id}`,
          suggestion,
          path: it.path,
        });
      }

      // Check for accents
      if (rules.ids.forbid_accents && hasAccents(id)) {
        const suggestion = toSnakeCase(id);
        violations.push({
          file: f.path,
          kind: "id-has-accents",
          message: `ID contient un accent: ${id}`,
          suggestion,
          path: it.path,
        });
      }

      // Check snake_case
      if (rules.ids.require_snake_case && !isSnakeCase(id)) {
        const suggestion = toSnakeCase(id);
        violations.push({
          file: f.path,
          kind: "id-not-snake",
          message: `ID non snake_case: ${id}`,
          suggestion,
          path: it.path,
        });
      }

      // Check auto-map
      if (rules.ids.auto_map[id]) {
        violations.push({
          file: f.path,
          kind: "id-auto-map",
          message: `ID à remapper: ${id} → ${rules.ids.auto_map[id]}`,
          suggestion: rules.ids.auto_map[id],
          path: it.path,
        });
      }
    }

    // Money checks: negative numbers
    if (rules.money.min_zero) {
      for (const n of walkNumbers(asJson)) {
        if (n.value < 0) {
          violations.push({
            file: f.path,
            kind: "money-negative",
            message: `Valeur négative à ${n.path}: ${n.value}`,
          });
        }
      }
    }

    // Enum normalization checks
    const choices = ids.filter((x) => /choices\[\d+\]\.id$/.test(x.path));
    for (const c of choices) {
      const raw = String(c.value);
      for (const [field, mapping] of Object.entries(
        rules.values.enum_normalization
      )) {
        if (mapping[raw]) {
          violations.push({
            file: f.path,
            kind: "enum-needs-normalization",
            message: `Normaliser valeur '${raw}' pour ${field} → ${mapping[raw]}`,
            suggestion: mapping[raw],
            path: c.path,
          });
        }
      }
    }

    // Geo rule: check for INSEE code requirement
    if (
      f.content.includes("getInseeNumber") &&
      rules.geo.require_insee_on_submit
    ) {
      violations.push({
        file: f.path,
        kind: "geo-missing-insee",
        message: "Exiger code INSEE en soumission (postal en fallback)",
        suggestion: "code_insee_commune",
      });
    }
  }

  const summary = `${violations.length} violation(s) trouvée(s) sur ${files.length} fichier(s) analysé(s)`;
  return { summary, violations };
}
