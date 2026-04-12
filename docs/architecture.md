# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Idea-to-Product Pipeline                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User Trigger                                                        │
│  ("I need a product idea" / completely random)                       │
│       │                                                              │
│       ▼                                                              │
│  ┌─────────────────┐                                                 │
│  │   Orchestrator   │ ← State machine, error handling, config        │
│  └────────┬─────────┘                                                 │
│           │                                                            │
│  ═════════╪══════════════════════════════════════════════════════      │
│  Phase 1: IDEA GENERATION (Creative Arena)                             │
│           │                                                            │
│           ▼                                                            │
│  ┌───────────────────────────────────────────────────────────┐         │
│  │              IdeaGen Arena (6-Role Debate)                 │         │
│  │                                                            │         │
│  │  Round 1: STORM ── 6 roles pitch in parallel               │         │
│  │  Round 2: ATTACK ── 6 roles critique in parallel           │         │
│  │  Round 3: SYNTHESIS ── converge on best idea               │         │
│  │                                                            │         │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐       │         │
│  │  │TrendHunter │ │ UserVoice  │ │     Engineer       │       │         │
│  │  └────────────┘ └────────────┘ └────────────────────┘       │         │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐       │         │
│  │  │Devil's     │ │Minimalist  │ │    Philosopher     │       │         │
│  │  │Advocate    │ │            │ │                    │       │         │
│  │  └────────────┘ └────────────┘ └────────────────────┘       │         │
│  └───────────────────────────────────────────────────────────┘         │
│           │                                                            │
│           │  Artifact: IdeaArtifact                                     │
│           │  { tagline, features, targetUser, confidence }             │
│           ▼                                                            │
│  ┌─────────────────┐                                                    │
│  │    Designer      │ ← Tech stack, pages, data model, UI specs        │
│  └────────┬─────────┘                                                    │
│           │                                                              │
│           │  Artifact: DesignArtifact                                     │
│           │  { techStack, pages, builderSpecs[], projectStructure }      │
│           ▼                                                              │
│  ════════════════════════════════════════════════════════════            │
│  Phase 2: DYNAMIC BUILD (Parallel Agents)                                │
│           │                                                              │
│           ├──► Config Builder ────┐                                      │
│           ├──► Frontend Builder ──┤    Parallel execution                │
│           ├──► Backend Builder ───┤    (Promise.allSettled)              │
│           ├──► Database Builder ──┤                                      │
│           ├──► Auth Builder ──────┤                                      │
│           ├──► Docs Builder ──────┘                                      │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                    │
│  │ IntegrationAgent │ ← Merge outputs, verify consistency               │
│  └────────┬─────────┘                                                    │
│           │                                                              │
│           │  Artifact: BuildArtifact                                      │
│           │  { repoPath, fileCount, buildStatus }                        │
│           ▼                                                              │
│  ════════════════════════════════════════════════════════════            │
│  Phase 3: REVIEW & FIX                                                   │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                    │
│  │    Reviewer      │ ← Build test → auto-fix (max 3 retries)           │
│  └────────┬─────────┘     Code quality review                           │
│           │              Feature completeness check                      │
│           │                                                              │
│           │  Artifact: ReviewArtifact                                     │
│           │  { passed, issues[], fixes[], testResults }                  │
│           ▼                                                              │
│  ════════════════════════════════════════════════════════════            │
│  Phase 4: DEPLOY                                                         │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────┐                                                    │
│  │    Deployer      │ ← Generate README, start dev server               │
│  └────────┬─────────┘     Poll until server ready                       │
│           │                                                              │
│           │  Artifact: DeployArtifact                                     │
│           │  { url, readmePath, summary, files[] }                       │
│           ▼                                                              │
│  ┌─────────────────┐                                                    │
│  │      DONE        │ ← Complete, runnable product                       │
│  └─────────────────┘                                                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
Build Phase
    │
    ├──► Build fails
    │        │
    │        ▼
    │    Reviewer detects failure
    │        │
    │        ├──► Auto-fix (LLM analyzes errors, writes corrected files)
    │        │        │
    │        │        ├──► Retry build (max 3 attempts)
    │        │        │        │
    │        │        │        ├──► Success → continue pipeline
    │        │        │        │
    │        │        │        └──► Still failing → throw
    │        │        │
    │        │        └──► No fix found → retry
    │        │
    │        └──► All retries exhausted → pipeline aborts
    │
    └──► Build succeeds → continue to Review → Deploy
```

## Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ IdeaArtifact │────►│DesignArtifact│────►│BuildArtifact │
│              │     │              │     │              │
│ • tagline    │     │ • techStack  │     │ • repoPath   │
│ • features   │     │ • pages[]    │     │ • fileCount  │
│ • targetUser │     │ • dataModel  │     │ • buildStatus│
│ • confidence │     │ • uiSpec     │     │ • errors[]   │
│ • insights[] │     │ • builderSpec│     │              │
└──────────────┘     │ • deps[]     │     └──────┬───────┘
                     │ • structure  │            │
                     └──────────────┘            │
                                                 ▼
                                        ┌──────────────┐     ┌──────────────┐
                                        │ReviewArtifact│────►│DeployArtifact│
                                        │              │     │              │
                                        │ • passed     │     │ • url        │
                                        │ • issues[]   │     │ • readmePath │
                                        │ • fixes[]    │     │ • summary    │
                                        │ • testResults│     │ • files[]    │
                                        └──────────────┘     └──────────────┘
```

## Agent Communication Pattern

All agents communicate through **structured JSON artifacts** persisted to the filesystem:

```
.idea-state/
├── idea.json       ← Output of IdeaGen Arena
├── design.json     ← Output of Designer
├── build.json      ← Output of Dynamic Builders
├── review.json     ← Output of Reviewer
└── deploy.json     ← Output of Deployer
```

This makes the pipeline:
- **Observable** — inspect any stage's output independently
- **Recoverable** — resume from any saved state
- **Debuggable** — examine intermediate artifacts

## Configuration Resolution

```
CLI Flags (highest priority)
    │
    ├──► --api-key, --model, --base-url, --max-tokens, --temperature
    │
    ▼
Environment Variables
    │
    ├──► ANTHROPIC_API_KEY, MODEL, ANTHROPIC_MODEL
    ├──► BASE_URL, ANTHROPIC_BASE_URL
    └──► MAX_TOKENS, TEMPERATURE
    │
    ▼
Config File (.idea-agent.json)
    │
    └──► Walks up directory tree to find config
    │
    ▼
Defaults (lowest priority)
    └───► model: claude-sonnet-4-6-20250514
          maxTokens: 8192, temperature: 0.7
```

## File Structure

```
src/
├── agents/
│   ├── idea-gen/
│   │   ├── arena.ts          # 6-role debate orchestration
│   │   └── roles.ts          # Role system prompts & personalities
│   ├── designer/
│   │   └── index.ts          # Product design & builder spec generation
│   ├── builder/
│   │   └── index.ts          # Dynamic parallel code generation
│   ├── reviewer/
│   │   └── index.ts          # Build/test/fix loop
│   └── deployer/
│       └── index.ts          # README generation & dev server
├── core/
│   ├── agent.ts              # Base agent class (Anthropic SDK wrapper)
│   ├── config.ts             # Configuration resolver
│   └── orchestrator.ts       # Pipeline state machine
├── types/
│   └── artifacts.ts          # All artifact type definitions
├── utils/
│   ├── logger.ts             # Colored terminal logging
│   └── fs-helpers.ts         # Async filesystem utilities
├── index.ts                  # Public API barrel exports
└── cli.ts                    # CLI entry point (commander)
```
