# Core Value

## What Is This

An autonomous agent system that turns a blank slate into a complete, runnable product — with zero human intervention in between.

User says: *"I don't know what to build."*
System delivers: *"Here's your product, running on localhost:5173."*

## The Problem

Most people with ideas never ship. Not because they can't code, but because the gap between "I have an idea" and "something people can use" involves dozens of decisions, hours of setup, and the friction of starting from scratch.

Even for experienced developers, the overhead of:
- Deciding what to build (analysis paralysis)
- Designing the architecture
- Scaffolding the project
- Implementing features
- Reviewing and fixing

...means most ideas die in the head.

## The Solution

Remove every step between idea and product. The system:

1. **Generates the idea** — not a random suggestion, but a creative output from a 6-role debate arena that argues, attacks, and converges on the best concept
2. **Designs the architecture** — tech stack, pages, data models, component structure
3. **Spawns parallel builders** — dynamically creates as many coding agents as the project needs, running simultaneously
4. **Reviews and self-fixes** — compiles the code, finds errors, fixes them automatically (up to 3 retries)
5. **Deploys** — generates documentation, starts the dev server, hands you a working product

## Key Differentiators

### 1. Creative Arena (Not Single-Point Generation)

Most AI tools generate one idea and present it. This system runs a **structured debate** between 6 distinct personas:

- **TrendHunter** — kills saturated ideas, champions market timing
- **UserVoice** — demands real pain, dismisses tech for tech's sake
- **Engineer** — reality-checks feasibility and scope
- **Devil's Advocate** — aggressively attacks every idea
- **Minimalist** — cuts scope to what ships
- **Philosopher** — pushes for meaning and differentiation

Three rounds: storm → attack → synthesis. The surviving idea has been stress-tested before a single line of code.

### 2. Dynamic Builder Spawning

Fixed pipelines break. This system analyzes the project type and spawns exactly the right team:

| Project Type | Builders Spawned |
|-------------|-----------------|
| Single-page app | config + frontend |
| Full-stack SaaS | config + frontend + backend + database + auth |
| Chrome extension | config + extension-core + popup-ui + background-script |
| CLI tool | config + core-logic + command-parser |
| API service | config + api-server + docs |

Builders run **in parallel** — a full-stack project's frontend and backend are generated simultaneously, then merged by an integration agent.

### 3. Self-Healing Build Pipeline

The Reviewer doesn't just check — it fixes. When a build fails:

1. Parses the compiler error
2. Reads the relevant source files
3. Asks the LLM to diagnose and fix
4. Applies the corrected code
5. Retries (up to 3 attempts)

Only if all retries fail does the pipeline abort.

### 4. Observable Pipeline

Every stage persists its output as a JSON artifact. At any point you can:

- Read `.idea-state/idea.json` to see what idea was generated
- Read `.idea-state/design.json` to see the technical spec
- Read `.idea-state/review.json` to see what bugs were found and fixed

This isn't a black box — it's a transparent pipeline.

### 5. API-Agnostic

Works with any compatible API:

- **Official Anthropic** — just set `ANTHROPIC_API_KEY`
- **Proxy / Gateway** — set `--base-url` to your endpoint
- **Compatible APIs** — OpenRouter, Azure, etc. via `BASE_URL`
- **Config file** — `.idea-agent.json` for persistent setup

## Who It's For

| User | Use Case |
|------|----------|
| **Developers** | Rapid prototyping, hackathon starters, exploring new stacks |
| **Entrepreneurs** | Validate ideas with a real MVP in minutes, not days |
| **Learners** | Study the generated code to understand patterns and architecture |
| **AI Enthusiasts** | See what autonomous multi-agent systems can produce end-to-end |

## What It Produces

Not stubs. Not templates. **Complete, runnable projects** with:

- Full component implementation (no `// TODO` placeholders)
- Working routing and navigation
- Proper error handling and loading states
- Professional UI with consistent theming
- README with getting-started instructions
- Dev server ready to run

## The Vision

This is a step toward **autonomous software creation** — where the gap between "I wonder if someone would use this" and "here it is, try it" shrinks to zero.

The current version produces local dev servers. The architecture is designed to extend to:

- One-click deployment (Vercel, Netlify, Railway)
- Database provisioning
- CI/CD pipeline generation
- Automated testing suites
- User feedback loops that feed back into the IdeaGen Arena
