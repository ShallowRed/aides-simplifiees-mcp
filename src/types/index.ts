import { z } from "zod";

// ============================================================================
// Domain Linter Types
// ============================================================================

export const LintAutoMap = z.record(z.string(), z.string());
export type T_LintAutoMap = z.infer<typeof LintAutoMap>;

export const LintRulesSchema = z.object({
  ids: z.object({
    disallow_hyphen: z.boolean().default(true),
    require_snake_case: z.boolean().default(true),
    forbid_accents: z.boolean().default(true),
    auto_map: LintAutoMap.default({}),
  }),
  values: z
    .object({
      enum_normalization: z
        .record(z.string(), z.record(z.string(), z.string()))
        .default({}),
    })
    .default({}),
  geo: z
    .object({
      canonical: z.string().default("code_insee_commune"),
      fallbacks: z.array(z.string()).default(["code_postal"]),
      ui_autocomplete_function: z.string().optional(),
      require_insee_on_submit: z.boolean().default(true),
    })
    .default({}),
  dates: z
    .object({
      ui_format_hint: z.string().default("jj/mm/aaaa"),
      storage_format: z.string().default("YYYY-MM-DD"),
      normalize_input: z.boolean().default(true),
    })
    .default({}),
  money: z
    .object({
      default_period: z.string().default("mensuel"),
      twelve_month_suffix: z.string().default("_12m_eur"),
      require_unit_eur: z.boolean().default(true),
      min_zero: z.boolean().default(true),
    })
    .default({}),
  arrays: z
    .object({
      exclusive_values: z.record(z.string(), z.string()).default({}),
    })
    .default({}),
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
    "money-negative",
  ]),
  message: z.string(),
  suggestion: z.string().optional(),
  path: z.string().optional(), // JSON path like $.steps[1].questions[0].id
});
export type T_LintViolation = z.infer<typeof LintViolation>;

export const LintResult = z.object({
  summary: z.string(),
  violations: z.array(LintViolation),
});
export type T_LintResult = z.infer<typeof LintResult>;

// ============================================================================
// GitHub Analyzer Types
// ============================================================================

export const GitHubRepoConfig = z.object({
  owner: z.string(),
  repo: z.string(),
  branch: z.string().default("main"),
  localPath: z.string().optional(),
});
export type T_GitHubRepoConfig = z.infer<typeof GitHubRepoConfig>;

export const ComponentInfo = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["page", "component", "layout", "api", "utility"]),
  imports: z.array(z.string()),
  exports: z.array(z.string()),
  dependencies: z.array(z.string()),
  linesOfCode: z.number(),
});
export type T_ComponentInfo = z.infer<typeof ComponentInfo>;

export const APIEndpoint = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  file: z.string(),
  handler: z.string(),
  params: z.array(z.string()).optional(),
  documented: z.boolean().default(false),
});
export type T_APIEndpoint = z.infer<typeof APIEndpoint>;

export const RepoAnalysis = z.object({
  repo: GitHubRepoConfig,
  analyzedAt: z.string(),
  components: z.array(ComponentInfo),
  apiEndpoints: z.array(APIEndpoint),
  fileCount: z.number(),
  totalLines: z.number(),
  techStack: z.array(z.string()),
});
export type T_RepoAnalysis = z.infer<typeof RepoAnalysis>;

// ============================================================================
// Architecture Analyzer Types
// ============================================================================

export const CouplingMetric = z.object({
  component: z.string(),
  afferentCoupling: z.number(), // Number of components depending on this
  efferentCoupling: z.number(), // Number of components this depends on
  instability: z.number(), // efferent / (afferent + efferent)
  score: z.enum(["good", "moderate", "high"]),
});
export type T_CouplingMetric = z.infer<typeof CouplingMetric>;

export const DuplicationInstance = z.object({
  files: z.array(z.string()),
  lines: z.number(),
  similarity: z.number(), // 0-1
  snippet: z.string(),
  suggestion: z.string(),
});
export type T_DuplicationInstance = z.infer<typeof DuplicationInstance>;

export const ComplexityMetric = z.object({
  file: z.string(),
  function: z.string(),
  cyclomaticComplexity: z.number(),
  cognitiveComplexity: z.number(),
  linesOfCode: z.number(),
  score: z.enum(["simple", "moderate", "complex", "very-complex"]),
});
export type T_ComplexityMetric = z.infer<typeof ComplexityMetric>;

export const CircularDependency = z.object({
  cycle: z.array(z.string()),
  severity: z.enum(["warning", "error"]),
});
export type T_CircularDependency = z.infer<typeof CircularDependency>;

export const ArchitectureAnalysis = z.object({
  analyzedAt: z.string(),
  coupling: z.array(CouplingMetric),
  duplication: z.array(DuplicationInstance),
  complexity: z.array(ComplexityMetric),
  circularDependencies: z.array(CircularDependency),
  healthScore: z.number(), // 0-100
});
export type T_ArchitectureAnalysis = z.infer<typeof ArchitectureAnalysis>;

// ============================================================================
// Doc Sync Types
// ============================================================================

export const DocSyncIssue = z.object({
  type: z.enum([
    "missing-docs",
    "outdated-example",
    "api-drift",
    "broken-link",
    "missing-implementation",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  docFile: z.string().optional(),
  codeFile: z.string().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
});
export type T_DocSyncIssue = z.infer<typeof DocSyncIssue>;

export const DocSyncReport = z.object({
  analyzedAt: z.string(),
  issues: z.array(DocSyncIssue),
  coverage: z.number(), // 0-100, percentage of documented APIs
  syncScore: z.number(), // 0-100
});
export type T_DocSyncReport = z.infer<typeof DocSyncReport>;

// ============================================================================
// Figma Sync Types
// ============================================================================

export const FigmaComponent = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  frameId: z.string().optional(),
  fields: z.array(z.string()).optional(),
});
export type T_FigmaComponent = z.infer<typeof FigmaComponent>;

export const FigmaSyncIssue = z.object({
  type: z.enum([
    "missing-component",
    "name-mismatch",
    "field-id-mismatch",
    "missing-screen",
  ]),
  figmaComponent: z.string().optional(),
  codeComponent: z.string().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
});
export type T_FigmaSyncIssue = z.infer<typeof FigmaSyncIssue>;

export const FigmaSyncReport = z.object({
  analyzedAt: z.string(),
  figmaFileId: z.string(),
  components: z.array(FigmaComponent),
  issues: z.array(FigmaSyncIssue),
  matchRate: z.number(), // 0-100
});
export type T_FigmaSyncReport = z.infer<typeof FigmaSyncReport>;

// ============================================================================
// Recommendation Engine Types
// ============================================================================

export const Recommendation = z.object({
  id: z.string(),
  category: z.enum([
    "refactoring",
    "duplication",
    "naming",
    "architecture",
    "documentation",
    "reusability",
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: z.string(),
  impact: z.string(),
  effort: z.enum(["small", "medium", "large"]),
  files: z.array(z.string()),
  suggestedAction: z.string(),
});
export type T_Recommendation = z.infer<typeof Recommendation>;

export const RecommendationReport = z.object({
  analyzedAt: z.string(),
  recommendations: z.array(Recommendation),
  summary: z.object({
    total: z.number(),
    byPriority: z.record(z.string(), z.number()),
    byCategory: z.record(z.string(), z.number()),
  }),
});
export type T_RecommendationReport = z.infer<typeof RecommendationReport>;

// ============================================================================
// Unified Report Types
// ============================================================================

export const UnifiedReport = z.object({
  generatedAt: z.string(),
  projectName: z.string(),
  overallHealthScore: z.number(), // 0-100
  summary: z.object({
    totalIssues: z.number(),
    criticalIssues: z.number(),
    recommendations: z.number(),
  }),
  domainLint: LintResult.optional(),
  repoAnalysis: RepoAnalysis.optional(),
  architectureAnalysis: ArchitectureAnalysis.optional(),
  docSync: DocSyncReport.optional(),
  figmaSync: FigmaSyncReport.optional(),
  recommendations: RecommendationReport.optional(),
});
export type T_UnifiedReport = z.infer<typeof UnifiedReport>;
