import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";
import {
  T_GitHubRepoConfig,
  T_RepoAnalysis,
  T_ComponentInfo,
  T_APIEndpoint,
} from "../types/index.js";
import { cloneOrUpdateRepo, listRepoFiles } from "../utils/git.js";
import { formatTimestamp } from "../utils/index.js";

/**
 * GitHub Repository Analyzer - Clone and analyze code structure
 */
export async function analyzeGitHubRepo(
  config: T_GitHubRepoConfig
): Promise<T_RepoAnalysis> {
  // Clone or update the repository
  const repoPath = await cloneOrUpdateRepo(config);

  // List all relevant files
  const files = await listRepoFiles(repoPath, [
    "**/*.{ts,tsx,js,jsx}",
    "!**/*.test.{ts,tsx,js,jsx}",
    "!**/*.spec.{ts,tsx,js,jsx}",
  ]);

  const components: T_ComponentInfo[] = [];
  const apiEndpoints: T_APIEndpoint[] = [];
  let totalLines = 0;
  const techStack = new Set<string>();

  for (const file of files) {
    const fullPath = path.join(repoPath, file);
    const content = await readFile(fullPath, "utf8");
    const lines = content.split("\n").length;
    totalLines += lines;

    try {
      // Parse the file to extract structure
      const ast = parse(content, {
        loc: true,
        range: true,
        jsx: file.endsWith("x"),
      });

      // Detect tech stack from imports
      if (content.includes("import React")) techStack.add("React");
      if (content.includes("from 'next")) techStack.add("Next.js");
      if (content.includes("from 'vue")) techStack.add("Vue");
      if (content.includes("express")) techStack.add("Express");
      if (content.includes("fastify")) techStack.add("Fastify");

      // Extract component information
      const componentInfo = extractComponentInfo(file, fullPath, ast, content, lines);
      if (componentInfo) {
        components.push(componentInfo);
      }

      // Extract API endpoints
      const endpoints = extractAPIEndpoints(file, fullPath, content);
      apiEndpoints.push(...endpoints);
    } catch (error) {
      // Skip files that can't be parsed
      console.warn(`Could not parse ${file}:`, error);
    }
  }

  return {
    repo: config,
    analyzedAt: formatTimestamp(),
    components,
    apiEndpoints,
    fileCount: files.length,
    totalLines,
    techStack: Array.from(techStack),
  };
}

/**
 * Extract component information from AST
 */
function extractComponentInfo(
  file: string,
  _fullPath: string,
  _ast: any,
  content: string,
  lines: number
): T_ComponentInfo | null {
  const imports: string[] = [];
  const exports: string[] = [];
  const dependencies: string[] = [];

  // Determine component type
  let type: T_ComponentInfo["type"] = "component";
  if (file.includes("/pages/") || file.includes("/app/")) type = "page";
  if (file.includes("/api/")) type = "api";
  if (file.includes("/layouts/") || file.includes("layout.")) type = "layout";
  if (file.includes("/utils/") || file.includes("/lib/")) type = "utility";

  // Extract imports
  const importMatches = content.matchAll(
    /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"](.*?)['"]/g
  );
  for (const match of importMatches) {
    const importPath = match[1];
    imports.push(importPath);
    if (importPath.startsWith(".")) {
      dependencies.push(importPath);
    }
  }

  // Extract exports
  const exportMatches = content.matchAll(
    /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g
  );
  for (const match of exportMatches) {
    exports.push(match[1]);
  }

  const name = path.basename(file, path.extname(file));

  return {
    name,
    path: file,
    type,
    imports,
    exports,
    dependencies,
    linesOfCode: lines,
  };
}

/**
 * Extract API endpoints from file content
 */
function extractAPIEndpoints(
  file: string,
  _fullPath: string,
  content: string
): T_APIEndpoint[] {
  const endpoints: T_APIEndpoint[] = [];

  // Next.js API routes pattern
  const nextApiMatch = file.match(/\/api\/(.+)\.(ts|js)$/);
  if (nextApiMatch) {
    const apiPath = `/api/${nextApiMatch[1]}`;
    
    // Check for HTTP methods
    const methods: Array<"GET" | "POST" | "PUT" | "PATCH" | "DELETE"> = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ];
    
    for (const method of methods) {
      if (
        content.includes(`export async function ${method}`) ||
        content.includes(`req.method === '${method}'`) ||
        content.includes(`req.method == '${method}'`)
      ) {
        endpoints.push({
          method,
          path: apiPath,
          file,
          handler: method.toLowerCase(),
          documented: false,
        });
      }
    }
  }

  // Express/Fastify route patterns
  const routePatterns = [
    /app\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g,
    /router\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g,
  ];

  for (const pattern of routePatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const method = match[1].toUpperCase() as T_APIEndpoint["method"];
      const apiPath = match[2];
      endpoints.push({
        method,
        path: apiPath,
        file,
        handler: "handler",
        documented: false,
      });
    }
  }

  return endpoints;
}
