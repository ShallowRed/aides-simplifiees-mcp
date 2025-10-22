#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { domainTermLinter } from "./tools/domainTermLinter.js";
import { analyzeGitHubRepo } from "./tools/githubAnalyzer.js";
import { analyzeArchitecture } from "./tools/architectureAnalyzer.js";
import { LintRulesSchema, GitHubRepoConfig } from "./types/index.js";

async function loadDomainRules() {
  const rulesPath = path.join(process.cwd(), "domain-rules.json");
  const rulesContent = await readFile(rulesPath, "utf8");
  return LintRulesSchema.parse(JSON.parse(rulesContent));
}

async function lintDomain() {
  console.log("🔍 Analyse des termes du domaine...\n");

  const repoPath = process.cwd();
  const rules = await loadDomainRules();

  const result = await domainTermLinter({
    repoPath,
    globs: ["**/*.json", "**/*.yaml", "!node_modules/**", "!dist/**", "!.git/**"],
    rules,
  });

  console.log(`📊 ${result.summary}\n`);

  if (result.violations.length > 0) {
    console.log("❌ Violations trouvées :\n");
    
    // Group violations by file
    const byFile = result.violations.reduce((acc, v) => {
      if (!acc[v.file]) acc[v.file] = [];
      acc[v.file].push(v);
      return acc;
    }, {} as Record<string, typeof result.violations>);

    for (const [file, violations] of Object.entries(byFile)) {
      console.log(`  📄 ${file}:`);
      for (const v of violations) {
        console.log(`     • ${v.message}`);
        if (v.suggestion) {
          console.log(`       💡 Suggestion: ${v.suggestion}`);
        }
        if (v.path) {
          console.log(`       🔗 Chemin: ${v.path}`);
        }
      }
      console.log();
    }

    process.exit(1);
  } else {
    console.log("✅ Aucune violation trouvée !");
    process.exit(0);
  }
}

async function analyzeRepo() {
  const owner = process.argv[3] || "betagouv";
  const repo = process.argv[4] || "aides-simplifiees-app";
  const branch = process.argv[5] || "main";

  console.log(`🔍 Analyse du dépôt ${owner}/${repo} (branche: ${branch})...\n`);

  const config = GitHubRepoConfig.parse({ owner, repo, branch });
  const result = await analyzeGitHubRepo(config);

  console.log(`📊 Résultats de l'analyse :\n`);
  console.log(`  • Fichiers analysés: ${result.fileCount}`);
  console.log(`  • Lignes de code: ${result.totalLines}`);
  console.log(`  • Composants: ${result.components.length}`);
  console.log(`  • Endpoints API: ${result.apiEndpoints.length}`);
  console.log(`  • Stack technique: ${result.techStack.join(", ")}\n`);

  // Show component breakdown
  const byType = result.components.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("📦 Composants par type :");
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  • ${type}: ${count}`);
  }
  console.log();

  // Show API endpoints
  if (result.apiEndpoints.length > 0) {
    console.log("🔌 Endpoints API détectés :");
    for (const endpoint of result.apiEndpoints.slice(0, 10)) {
      console.log(`  • ${endpoint.method} ${endpoint.path}`);
    }
    if (result.apiEndpoints.length > 10) {
      console.log(`  ... et ${result.apiEndpoints.length - 10} autres`);
    }
    console.log();
  }

  console.log(`✅ Analyse terminée !`);
}

async function analyzeArch() {
  const owner = process.argv[3] || "betagouv";
  const repo = process.argv[4] || "aides-simplifiees-app";
  const branch = process.argv[5] || "main";

  console.log(
    `🏗️  Analyse de l'architecture de ${owner}/${repo} (branche: ${branch})...\n`
  );

  // First, analyze the repo
  const config = GitHubRepoConfig.parse({ owner, repo, branch });
  const repoAnalysis = await analyzeGitHubRepo(config);

  // Then analyze architecture
  const repoPath = path.join(process.cwd(), ".repos", owner, repo);
  const result = await analyzeArchitecture(repoAnalysis.components, repoPath);

  console.log(`📊 Score de santé: ${result.healthScore}/100\n`);

  // Coupling issues
  const highCoupling = result.coupling.filter((c) => c.score === "high");
  if (highCoupling.length > 0) {
    console.log(`⚠️  ${highCoupling.length} composants avec couplage élevé :`);
    for (const c of highCoupling.slice(0, 5)) {
      console.log(
        `  • ${c.component} (instabilité: ${c.instability.toFixed(2)})`
      );
    }
    if (highCoupling.length > 5) {
      console.log(`  ... et ${highCoupling.length - 5} autres`);
    }
    console.log();
  }

  // Duplication
  if (result.duplication.length > 0) {
    console.log(`🔄 ${result.duplication.length} cas de duplication détectés :`);
    for (const d of result.duplication.slice(0, 3)) {
      console.log(`  • ${d.files.join(" ↔️ ")}`);
      console.log(`    Similarité: ${(d.similarity * 100).toFixed(0)}%`);
      console.log(`    💡 ${d.suggestion}`);
    }
    if (result.duplication.length > 3) {
      console.log(`  ... et ${result.duplication.length - 3} autres`);
    }
    console.log();
  }

  // Complexity
  const veryComplex = result.complexity.filter(
    (c) => c.score === "very-complex"
  );
  if (veryComplex.length > 0) {
    console.log(`🧩 ${veryComplex.length} fonctions très complexes :`);
    for (const c of veryComplex.slice(0, 5)) {
      console.log(`  • ${c.file}::${c.function}`);
      console.log(
        `    Complexité cyclomatique: ${c.cyclomaticComplexity}, cognitive: ${c.cognitiveComplexity}`
      );
    }
    if (veryComplex.length > 5) {
      console.log(`  ... et ${veryComplex.length - 5} autres`);
    }
    console.log();
  }

  // Circular dependencies
  if (result.circularDependencies.length > 0) {
    console.log(
      `🔁 ${result.circularDependencies.length} dépendances circulaires :`
    );
    for (const cd of result.circularDependencies.slice(0, 3)) {
      console.log(`  • ${cd.cycle.join(" → ")}`);
      console.log(`    Sévérité: ${cd.severity}`);
    }
    if (result.circularDependencies.length > 3) {
      console.log(`  ... et ${result.circularDependencies.length - 3} autres`);
    }
    console.log();
  }

  console.log(`✅ Analyse terminée !`);

  if (result.healthScore < 70) {
    console.log(
      "\n⚠️  Score de santé faible. Considérer des refactorings."
    );
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║      Aides Simplifiées MCP Agent - CLI                       ║
╚═══════════════════════════════════════════════════════════════╝

Usage: npm run dev:cli <commande> [arguments]

Commandes disponibles:

  lint-domain
    Analyse les fichiers JSON/YAML du projet pour vérifier
    les conventions de nommage et la cohérence des données.
    
  analyze-repo <owner> <repo> [branch]
    Clone et analyse un dépôt GitHub.
    Exemple: npm run dev:cli analyze-repo betagouv aides-simplifiees-app main
    
  analyze-arch <owner> <repo> [branch]
    Analyse l'architecture d'un dépôt (couplage, duplication, complexité).
    Exemple: npm run dev:cli analyze-arch betagouv aides-simplifiees-app main
    
  help
    Affiche cette aide.

Configuration:

  Les règles de linting sont définies dans domain-rules.json
  Le glossaire se trouve dans domain/glossaire.yml

Pour plus d'informations, consultez README.md
`);
}

async function main() {
  const command = process.argv[2];

  if (!command || command === "help") {
    showHelp();
    return;
  }

  try {
    switch (command) {
      case "lint-domain":
        await lintDomain();
        break;

      case "analyze-repo":
        await analyzeRepo();
        break;

      case "analyze-arch":
        await analyzeArch();
        break;

      default:
        console.error(`❌ Commande inconnue: ${command}`);
        console.error("   Utilisez 'npm run dev:cli help' pour voir l'aide.");
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  }
}

main();
