#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Import tools
import { domainTermLinter } from "./tools/domainTermLinter.js";
import { analyzeGitHubRepo } from "./tools/githubAnalyzer.js";
import { analyzeArchitecture } from "./tools/architectureAnalyzer.js";

// Import types
import {
  LintInput,
  GitHubRepoConfig,
  LintRulesSchema,
} from "./types/index.js";

const server = new Server(
  {
    name: "aides-simplifiees-mcp-agent",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Load domain rules configuration
async function loadDomainRules() {
  try {
    const rulesPath = path.join(process.cwd(), "domain-rules.json");
    const rulesContent = await readFile(rulesPath, "utf8");
    return LintRulesSchema.parse(JSON.parse(rulesContent));
  } catch (error) {
    console.error("Failed to load domain rules:", error);
    throw error;
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "domain_term_linter",
        description:
          "Valide les conventions de nommage des champs, la normalisation des enums et la cohérence des données dans les fichiers JSON/YAML du projet.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description:
                "Chemin vers le répertoire à analyser (par défaut: répertoire courant)",
            },
            globs: {
              type: "array",
              items: { type: "string" },
              description:
                "Patterns de fichiers à analyser (par défaut: **/*.json, **/*.yaml)",
            },
          },
        },
      },
      {
        name: "analyze_github_repo",
        description:
          "Clone et analyse un dépôt GitHub pour extraire la structure des composants, les routes API, les dépendances et les métriques du code.",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Propriétaire du dépôt GitHub (ex: betagouv)",
            },
            repo: {
              type: "string",
              description: "Nom du dépôt (ex: aides-simplifiees-app)",
            },
            branch: {
              type: "string",
              description: "Branche à analyser (par défaut: main)",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "analyze_architecture",
        description:
          "Analyse l'architecture du code pour détecter le couplage, la duplication, les dépendances circulaires et la complexité. Nécessite d'avoir d'abord analysé le dépôt avec analyze_github_repo.",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Propriétaire du dépôt",
            },
            repo: {
              type: "string",
              description: "Nom du dépôt",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "check_doc_sync",
        description:
          "Vérifie la synchronisation entre la documentation et l'implémentation du code. Détecte les API non documentées, les exemples obsolètes et les divergences.",
        inputSchema: {
          type: "object",
          properties: {
            appRepo: {
              type: "object",
              properties: {
                owner: { type: "string" },
                repo: { type: "string" },
              },
              required: ["owner", "repo"],
            },
            docsRepo: {
              type: "object",
              properties: {
                owner: { type: "string" },
                repo: { type: "string" },
              },
              required: ["owner", "repo"],
            },
          },
          required: ["appRepo", "docsRepo"],
        },
      },
      {
        name: "check_figma_sync",
        description:
          "Vérifie la cohérence entre les maquettes Figma et l'implémentation du code. Compare les noms de composants, les IDs de champs et les écrans.",
        inputSchema: {
          type: "object",
          properties: {
            figmaFileId: {
              type: "string",
              description: "ID du fichier Figma",
            },
            owner: {
              type: "string",
              description: "Propriétaire du dépôt GitHub",
            },
            repo: {
              type: "string",
              description: "Nom du dépôt GitHub",
            },
          },
          required: ["figmaFileId", "owner", "repo"],
        },
      },
      {
        name: "generate_recommendations",
        description:
          "Génère des recommandations d'amélioration basées sur toutes les analyses précédentes. Propose des refactorings, extractions de composants partagés et améliorations architecturales.",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Propriétaire du dépôt",
            },
            repo: {
              type: "string",
              description: "Nom du dépôt",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "generate_unified_report",
        description:
          "Génère un rapport unifié complet montrant l'état de santé du projet, la synchronisation entre artefacts et les priorités d'amélioration.",
        inputSchema: {
          type: "object",
          properties: {
            projectName: {
              type: "string",
              description: "Nom du projet",
            },
            appRepo: {
              type: "object",
              properties: {
                owner: { type: "string" },
                repo: { type: "string" },
              },
            },
            docsRepo: {
              type: "object",
              properties: {
                owner: { type: "string" },
                repo: { type: "string" },
              },
            },
            figmaFileId: {
              type: "string",
              description: "ID du fichier Figma (optionnel)",
            },
          },
          required: ["projectName"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "domain_term_linter": {
        const repoPath = (args?.repoPath as string) || process.cwd();
        const globs = (args?.globs as string[]) || ["**/*.json", "**/*.yaml"];
        const rules = await loadDomainRules();

        const result = await domainTermLinter(
          LintInput.parse({ repoPath, globs, rules })
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "analyze_github_repo": {
        const config = GitHubRepoConfig.parse(args);
        const result = await analyzeGitHubRepo(config);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "analyze_architecture": {
        const config = GitHubRepoConfig.parse(args);
        
        // First analyze the repo to get components
        const repoAnalysis = await analyzeGitHubRepo(config);
        
        // Then analyze architecture
        const repoPath = path.join(
          process.cwd(),
          ".repos",
          config.owner,
          config.repo
        );
        const result = await analyzeArchitecture(
          repoAnalysis.components,
          repoPath
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "check_doc_sync": {
        return {
          content: [
            {
              type: "text",
              text: "Doc sync checker - Implementation à venir",
            },
          ],
        };
      }

      case "check_figma_sync": {
        return {
          content: [
            {
              type: "text",
              text: "Figma sync checker - Implementation à venir",
            },
          ],
        };
      }

      case "generate_recommendations": {
        return {
          content: [
            {
              type: "text",
              text: "Recommendation engine - Implementation à venir",
            },
          ],
        };
      }

      case "generate_unified_report": {
        return {
          content: [
            {
              type: "text",
              text: "Unified report generator - Implementation à venir",
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Aides Simplifiées MCP Agent running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
