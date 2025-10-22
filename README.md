# Aides Simplifiées MCP Agent

> **Model Context Protocol agent** for analyzing, synchronizing, and improving the architecture of the French government's subsidy simulator project.

## 🎯 Purpose

This MCP agent helps maintain consistency and quality across multiple artifacts:
- **Code repositories**: [aides-simplifiees-app](https://github.com/betagouv/aides-simplifiees-app) & [aides-simplifiees-docs](https://github.com/betagouv/aides-simplifiees-docs)
- **Figma designs**: UI/UX models and user flows
- **Domain models**: Glossary and business rules

## 🛠️ Tools Provided

### 1. **Domain Term Linter** ✅
Validates field naming conventions, enum normalization, and data consistency in JSON/YAML files.

### 2. **GitHub Repository Analyzer** 🚧
Clones and analyzes the actual codebases to extract:
- Component structure and dependencies
- API routes and endpoints
- Import/export graphs
- Simulator implementations

### 3. **Architecture Analyzer** 🚧
Detects code quality issues:
- Component coupling metrics
- Code duplication
- Circular dependencies
- Complexity metrics (cyclomatic, cognitive)

### 4. **Doc-Code Sync Validator** 🚧
Ensures documentation matches implementation:
- API endpoint drift detection
- Outdated code examples
- Missing documentation

### 5. **Figma Integration** 🚧
Synchronizes design with code:
- Screen-to-route mapping
- Component name consistency
- Field ID validation

### 6. **Architecture Recommendation Engine** 🚧
Provides actionable suggestions:
- Refactoring opportunities
- Shared component extraction
- Separation of concerns improvements
- Reusability enhancements

### 7. **Unified Reporting** 🚧
Generates comprehensive health reports:
- Cross-artifact sync status
- Architecture quality score
- Prioritized improvement list

## 🚀 Quick Start

### Installation

```bash
npm install
npm run build
```

### Usage as MCP Server

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "aides-simplifiees": {
      "command": "node",
      "args": ["/path/to/aides-simplifiees-mcp/dist/index.js"],
      "env": {
        "FIGMA_TOKEN": "your-figma-token-here"
      }
    }
  }
}
```

### Usage as CLI

```bash
# Lint domain terms
npm run lint:domain

# Analyze architecture
npm run dev:cli analyze-architecture

# Check sync status
npm run dev:cli check-sync
```

## 📁 Project Structure

```
aides-simplifiees-mcp/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── cli.ts                      # CLI entry point
│   ├── types/                      # Shared TypeScript types
│   ├── tools/                      # MCP tool implementations
│   │   ├── domainTermLinter.ts
│   │   ├── githubAnalyzer.ts
│   │   ├── architectureAnalyzer.ts
│   │   ├── docSyncValidator.ts
│   │   ├── figmaSync.ts
│   │   ├── recommendationEngine.ts
│   │   └── unifiedReporting.ts
│   └── utils/                      # Shared utilities
├── domain/
│   └── glossaire.yml               # Domain glossary
├── domain-rules.json               # Linting rules
└── README.md
```

## 🧪 Testing

```bash
npm test
```

## 📚 Documentation

See the [instructions.txt](./instructions.txt) for the complete implementation plan and architectural guidelines.

## 🤝 Contributing

This project follows the Aides Simplifiées conventions:
- **Field IDs**: snake_case, no hyphens, no accents
- **Enums**: Normalized slugs from glossary
- **Money values**: 12-month aggregates with `_12m_eur` suffix
- **Geography**: Prefer INSEE codes over postal codes

## 📄 License

This project is part of the French government's beta.gouv.fr initiative.

---

**Status**: 🚧 Active Development | **Version**: 0.1.0 | **Last Updated**: 22 octobre 2025
