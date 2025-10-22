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

/**
 * Architecture Analyzer - Detects coupling, duplication, complexity issues
 */
export async function analyzeArchitecture(
  components: T_ComponentInfo[],
  repoPath: string
): Promise<T_ArchitectureAnalysis> {
  const coupling = calculateCoupling(components);
  const duplication = await detectDuplication(components, repoPath);
  const complexity = await calculateComplexity(components, repoPath);
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
 * Detect code duplication across components
 */
async function detectDuplication(
  components: T_ComponentInfo[],
  repoPath: string
): Promise<T_DuplicationInstance[]> {
  const instances: T_DuplicationInstance[] = [];
  const minLines = 10; // Minimum lines to consider duplication
  const minSimilarity = 0.8; // 80% similarity threshold

  // Read all component contents
  const componentContents = await Promise.all(
    components.map(async (c) => {
      const fullPath = path.join(repoPath, c.path);
      try {
        const content = await readFile(fullPath, "utf8");
        return { component: c, content, lines: content.split("\n") };
      } catch {
        return { component: c, content: "", lines: [] };
      }
    })
  );

  // Compare each pair of components
  for (let i = 0; i < componentContents.length; i++) {
    for (let j = i + 1; j < componentContents.length; j++) {
      const a = componentContents[i];
      const b = componentContents[j];

      if (a.lines.length < minLines || b.lines.length < minLines) continue;

      // Calculate similarity
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

  return instances;
}

/**
 * Calculate complexity metrics for components
 */
async function calculateComplexity(
  components: T_ComponentInfo[],
  repoPath: string
): Promise<T_ComplexityMetric[]> {
  const metrics: T_ComplexityMetric[] = [];

  for (const component of components) {
    const fullPath = path.join(repoPath, component.path);
    try {
      const content = await readFile(fullPath, "utf8");
      const ast = parse(content, {
        loc: true,
        range: true,
        jsx: component.path.endsWith("x"),
      });

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
