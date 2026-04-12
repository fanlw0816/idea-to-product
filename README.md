# Idea-to-Product

Autonomous idea-to-product agent system. From brainstorm to shipped product, zero human intervention.

## How It Works

```
User triggers ("I need a product idea")
         │
    ┌────┴────┐
    ▼         ▼
 IdeaGen Arena  ← 6 roles debate (TrendHunter, UserVoice, Engineer,
    │              DevilAdvocate, Minimalist, Philosopher)
    ▼
   Designer  ← Tech stack, pages, data model, dynamic builder specs
    │
    ▼
 Dynamic Builders  ← Parallel agents based on project needs
    │                 (frontend, backend, database, auth, etc.)
    ▼
 IntegrationAgent  ← Merges all builder outputs
    │
    ▼
  Reviewer  ← Build, test, fix errors (auto-retry up to 3x)
    │
    ▼
  Deployer  ← README, dev server, deployment info
    │
    ▼
  DONE — Complete, runnable product
```

## Quick Start

```bash
# Install
npm install

# Set API key
export ANTHROPIC_API_KEY=your-key-here

# Run with a prompt
npx tsx src/cli.ts "I want to build something fun"

# Or random brainstorm
npx tsx src/cli.ts

# Verbose mode
npx tsx src/cli.ts -v "Make a tool for developers"

# Custom output directory
npx tsx src/cli.ts -o ./my-products "Build a portfolio site"
```

## Architecture

| Agent | Role | Parallel? |
|-------|------|-----------|
| **IdeaGen Arena** | 6-role creative debate | Internal parallel |
| **Designer** | Tech architecture & specs | Sequential |
| **Dynamic Builders** | Code generation | Parallel (per spec) |
| **IntegrationAgent** | Merge builder outputs | Sequential |
| **Reviewer** | Build, test, auto-fix | Sequential |
| **Deployer** | Docs, dev server | Sequential |

### Dynamic Builder Spawning

The Designer analyzes the project type and decides which builders are needed:

- **SPA** → config + frontend
- **Full-stack app** → config + frontend + backend + database
- **Chrome extension** → config + extension-core + popup-ui + background-script
- **CLI tool** → config + core-logic + command-parser
- **API service** → config + api-server + docs

Each builder runs in parallel, generating its assigned files simultaneously.

## Project Structure

```
src/
├── agents/
│   ├── idea-gen/
│   │   ├── arena.ts      # 6-role debate arena
│   │   └── roles.ts      # Role definitions
│   ├── designer/
│   │   └── index.ts      # Product design
│   ├── builder/
│   │   └── index.ts      # Dynamic parallel builders
│   ├── reviewer/
│   │   └── index.ts      # Build/test/fix loop
│   └── deployer/
│       └── index.ts      # Docs & deployment
├── core/
│   ├── agent.ts          # Base agent class
│   └── orchestrator.ts   # Pipeline orchestrator
├── types/
│   └── artifacts.ts      # Type definitions
├── utils/
│   ├── logger.ts         # Logging
│   └── fs-helpers.ts     # File operations
└── cli.ts                # CLI entry point
```

## Requirements

- Node.js 20+
- Anthropic API key (`ANTHROPIC_API_KEY`)

## License

MIT
