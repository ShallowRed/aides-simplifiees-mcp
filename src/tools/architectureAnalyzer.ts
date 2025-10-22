import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";
import {
  T_ArchitectureAnalysis,
  T_CouplingMetric,
  T_DuplicationInstance,
  T_ComplexityMetric,
  T_CircularDependency,
  T_ComponentInfo,
} from "../types/index.js";
import { formatTimestamp, similarity } from "../utils/index.js";

// Performance optimization: Cache file contents and ASTs
const fileCache = new Map<string, string>();
const astCache = new Map<string, any>();

/**
 * Clear caches (useful for testing or memory management)
 */
export function clearAnalysisCache() {
  fileCache.clear();
  astCache.clear();
}

/**
 * Architecture Analyzer - Detects coupling, duplication, complexity issues (OPTIMIZED)
 */
export async function analyzeArchitecture(
  components: T_ComponentInfo[],
  repoPath: string
): Promise<T_ArchitectureAnalysis> {
  console.log(`📊 Analyzing ${components.length} components...`);
  
  console.log("  → Calculating coupling metrics...");
  const coupling = calculateCoupling(components);
  
  console.log("  → Detecting code duplication...");
  const duplication = await detectDuplication(components, repoPath);
  
  console.log("  → Calculating complexity metrics...");
  const complexity = await calculateComplexity(components, repoPath);
  
  console.log("  → Detecting circular dependencies...");
  const circularDependencies = detectCircularDependencies(components);

  // Calculate overall health score (0-100)
  const healthScore = calculateHealthScore({
    coupling,
    duplication,
    complexity,
    circularDependencies,
  });

  return {
    analyzedAt: formatTimestamp(),
    coupling,
    duplication,
    complexity,
    circularDependencies,
    healthScore,
  };
}

/**
 * Calculate coupling metrics for each component
 */
function calculateCoupling(components: T_ComponentInfo[]): T_CouplingMetric[] {
  const metrics: T_CouplingMetric[] = [];

  for (const component of components) {
    // Afferent coupling: how many components depend on this one
    const afferentCoupling = components.filter((c) =>
      c.dependencies.some((dep) => dep.includes(component.name))
    ).length;

    // Efferent coupling: how many components this depends on
    const efferentCoupling = component.dependencies.filter((dep) =>
      dep.startsWith(".")
    ).length;

    // Instability = efferent / (afferent + efferent)
    const total = afferentCoupling + efferentCoupling;
    const instability = total > 0 ? efferentCoupling / total : 0;

    // Score based on instability and coupling count
    let score: T_CouplingMetric["score"] = "good";
    if (instability > 0.7 || efferentCoupling > 10) score = "high";
    else if (instability > 0.5 || efferentCoupling > 5) score = "moderate";

    metrics.push({
      component: component.path,
      afferentCoupling,
      efferentCoupling,
      instability,
      score,
    });
  }

  return metrics;
}

/**
 * Simple hash function for quick content comparison
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Read and cache file content
 */
async function getCachedFileContent(filePath: string): Promise<string> {
  let content = fileCache.get(filePath);
  if (!content) {
    try {
      content = await readFile(filePath, "utf8");
      fileCache.set(filePath, content);
    } catch {
      content = "";
    }
  }
  return content;
}

/**
 * Detect code duplication across components (OPTIMIZED)
 */
async function detectDuplication(
  components: T_ComponentInfo[],
  repoPath: string
): Promise<T_DuplicationInstance[]> {
  const instances: T_DuplicationInstance[] = [];
  const minLines = 10;
  const minSimilarity = 0.85; // Increased to reduce false positives
  const maxComparisons = 100000; // Cap for performance
  const sizeTolerance = 0.5; // Skip if size differs by >50%

  // Filter: skip test files and small files
  const largeComponents = components.filter(
    (c) =>
      c.linesOfCode >= minLines &&
      !c.path.includes(".test.") &&
      !c.path.includes(".spec.")
  );

  console.log(`    Checking ${largeComponents.length} files (filtered from ${components.length})...`);

  // Read all contents with caching
  const componentContents = await Promise.all(
    largeComponents.map(async (c) => {
      const fullPath = path.join(repoPath, c.path);
      const content = await getCachedFileContent(fullPath);
      return {
        component: c,
        content,
        lines: content.split("\n"),
        hash: hashCode(content),
      };
    })
  );

  // Smart comparison with early exits
  let comparisons = 0;
  let skippedSize = 0;
  let skippedHash = 0;
  let actualSimilarityChecks = 0;
  
  for (let i = 0; i < componentContents.length; i++) {
    for (let j = i + 1; j < componentContents.length; j++) {
      comparisons++;
      
      if (comparisons >= maxComparisons) {
        console.log(`    ⚠️  Reached ${maxComparisons} comparisons, stopping early (found ${instances.length} duplications)...`);
        console.log(`    📊 Stats: ${actualSimilarityChecks} similarity checks, ${skippedSize} skipped by size, ${skippedHash} skipped by hash`);
        return instances;
      }

      const a = componentContents[i];
      const b = componentContents[j];

      // Quick filters before expensive similarity check
      if (a.lines.length < minLines || b.lines.length < minLines) continue;

      // Skip if size difference is too large
      const sizeRatio =
        Math.min(a.lines.length, b.lines.length) /
        Math.max(a.lines.length, b.lines.length);
      if (sizeRatio < sizeTolerance) {
        skippedSize++;
        continue;
      }

      // Skip if hashes are too different (optimization)
      if (Math.abs(a.hash - b.hash) > 100000) {
        skippedHash++;
        continue;
      }

      // Now do the expensive similarity check
      actualSimilarityChecks++;
      const sim = similarity(a.content, b.content);

      if (sim >= minSimilarity) {
        // Extract common snippet (first 5 lines as preview)
        const snippet = a.lines.slice(0, 5).join("\n") + "\n...";

        instances.push({
          files: [a.component.path, b.component.path],
          lines: Math.min(a.lines.length, b.lines.length),
          similarity: sim,
          snippet,
          suggestion: `Envisager d'extraire le code commun dans un composant ou utilitaire partagé`,
        });
      }
    }
  }

  console.log(`    ✅ Completed ${comparisons} comparisons: ${actualSimilarityChecks} similarity checks, ${skippedSize} skipped by size, ${skippedHash} skipped by hash`);
  return instances;
}

/**
 * Calculate complexity metrics for components (OPTIMIZED with batching)
 */
async function calculateComplexity(
  components: T_ComponentInfo[],
  repoPath: string
): Promise<T_ComplexityMetric[]> {
  const metrics: T_ComplexityMetric[] = [];
  const batchSize = 20;
  let processed = 0;

  console.log(`    Analyzing complexity for ${components.length} files...`);

  // Process in batches for better performance
  for (let i = 0; i < components.length; i += batchSize) {
    const batch = components.slice(i, Math.min(i + batchSize, components.length));

    // Process batch in parallel
    const batchMetrics = await Promise.all(
      batch.map(async (component) => {
        processed++;
        if (processed % 50 === 0) {
          console.log(`    Processed ${processed}/${components.length} files...`);
        }
        return analyzeComponentComplexity(component, repoPath);
      })
    );

    // Flatten and add to metrics
    metrics.push(...batchMetrics.flat());
  }

  return metrics;
}

/**
 * Analyze complexity for a single component (with caching)
 */
async function analyzeComponentComplexity(
  component: T_ComponentInfo,
  repoPath: string
): Promise<T_ComplexityMetric[]> {
  const metrics: T_ComplexityMetric[] = [];
  const fullPath = path.join(repoPath, component.path);

  try {
    // Use cached content
    const content = await getCachedFileContent(fullPath);
    if (!content) return metrics;

    // Use cached AST or parse
    let ast = astCache.get(fullPath);
    if (!ast) {
      ast = parse(content, {
        loc: true,
        range: true,
        jsx: component.path.endsWith("x"),
      });
      astCache.set(fullPath, ast);
    }

    // Extract functions from AST
    const functions = extractFunctions(ast, content);

    for (const func of functions) {
      const cyclomatic = calculateCyclomaticComplexity(func.body);
      const cognitive = calculateCognitiveComplexity(func.body);

      let score: T_ComplexityMetric["score"] = "simple";
      if (cyclomatic > 20 || cognitive > 15) score = "very-complex";
      else if (cyclomatic > 10 || cognitive > 7) score = "complex";
      else if (cyclomatic > 5 || cognitive > 3) score = "moderate";

      metrics.push({
        file: component.path,
        function: func.name,
        cyclomaticComplexity: cyclomatic,
        cognitiveComplexity: cognitive,
        linesOfCode: func.lines,
        score,
      });
    }
  } catch {
    // Skip files that can't be parsed
  }

  return metrics;
}

/**
 * Extract function information from AST
 */
function extractFunctions(
  ast: any,
  content: string
): Array<{ name: string; body: string; lines: number }> {
  const functions: Array<{ name: string; body: string; lines: number }> = [];

  function walk(node: any) {
    if (!node) return;

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      const name =
        node.id?.name ||
        (node.parent?.type === "VariableDeclarator"
          ? node.parent.id?.name
          : "anonymous");

      if (node.range) {
        const body = content.slice(node.range[0], node.range[1]);
        const lines = body.split("\n").length;
        functions.push({ name: name || "anonymous", body, lines });
      }
    }

    // Recursively walk children
    for (const key in node) {
      if (node[key] && typeof node[key] === "object") {
        if (Array.isArray(node[key])) {
          node[key].forEach((child: any) => {
            if (child) child.parent = node;
            walk(child);
          });
        } else {
          node[key].parent = node;
          walk(node[key]);
        }
      }
    }
  }

  walk(ast);
  return functions;
}

/**
 * Calculate cyclomatic complexity (number of decision points)
 */
function calculateCyclomaticComplexity(code: string): number {
  let complexity = 1; // Base complexity

  // Count decision points
  const patterns = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\&\&/g,
    /\|\|/g,
    /\?/g, // Ternary operator
  ];

  for (const pattern of patterns) {
    const matches = code.match(pattern);
    if (matches) complexity += matches.length;
  }

  return complexity;
}

/**
 * Calculate cognitive complexity (how hard it is to understand)
 */
function calculateCognitiveComplexity(code: string): number {
  let complexity = 0;
  let nestingLevel = 0;

  const lines = code.split("\n");

  for (const line of lines) {
    // Track nesting level
    if (line.includes("{")) nestingLevel++;
    if (line.includes("}")) nestingLevel = Math.max(0, nestingLevel - 1);

    // Add complexity for control structures
    if (/\b(if|for|while|switch|catch)\b/.test(line)) {
      complexity += 1 + nestingLevel; // Nesting increases cognitive load
    }

    // Add for logical operators
    const logicalOps = (line.match(/(\&\&|\|\|)/g) || []).length;
    complexity += logicalOps;
  }

  return complexity;
}

/**
 * Detect circular dependencies
 */
function detectCircularDependencies(
  components: T_ComponentInfo[]
): T_CircularDependency[] {
  const cycles: T_CircularDependency[] = [];
  const graph = buildDependencyGraph(components);

  function findCycles(
    node: string,
    visited: Set<string>,
    path: string[]
  ): void {
    if (path.includes(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      const cycle = [...path.slice(cycleStart), node];
      
      // Avoid duplicates
      const cycleKey = cycle.sort().join("->");
      if (!cycles.some((c) => c.cycle.sort().join("->") === cycleKey)) {
        cycles.push({
          cycle,
          severity: cycle.length <= 3 ? "error" : "warning",
        });
      }
      return;
    }

    if (visited.has(node)) return;
    visited.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      findCycles(neighbor, visited, [...path, node]);
    }
  }

  for (const component of components) {
    findCycles(component.path, new Set(), []);
  }

  return cycles;
}

/**
 * Build dependency graph from components
 */
function buildDependencyGraph(
  components: T_ComponentInfo[]
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const component of components) {
    const dependencies = component.dependencies
      .map((dep) => {
        // Resolve relative imports to component paths
        const resolved = components.find((c) =>
          c.path.includes(dep.replace(/^\.\.?\//, ""))
        );
        return resolved?.path;
      })
      .filter((dep): dep is string => dep !== undefined);

    graph.set(component.path, dependencies);
  }

  return graph;
}

/**
 * Calculate overall architecture health score
 */
function calculateHealthScore(metrics: {
  coupling: T_CouplingMetric[];
  duplication: T_DuplicationInstance[];
  complexity: T_ComplexityMetric[];
  circularDependencies: T_CircularDependency[];
}): number {
  let score = 100;

  // Deduct for coupling issues
  const highCoupling = metrics.coupling.filter((c) => c.score === "high").length;
  score -= highCoupling * 3;

  // Deduct for duplication
  score -= metrics.duplication.length * 5;

  // Deduct for complexity
  const veryComplex = metrics.complexity.filter(
    (c) => c.score === "very-complex"
  ).length;
  const complex = metrics.complexity.filter((c) => c.score === "complex").length;
  score -= veryComplex * 4;
  score -= complex * 2;

  // Deduct for circular dependencies
  score -= metrics.circularDependencies.length * 10;

  return Math.max(0, Math.min(100, score));
}
