import { BaseAgent } from '../../core/agent.js';
import { logger } from '../../utils/logger.js';
import type {
  IdeaArtifact,
  DesignArtifact,
  BuilderSpec,
} from '../../types/artifacts.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export class DesignerAgent extends BaseAgent {
  constructor(config: { apiKey?: string; baseUrl?: string; model?: string }) {
    super({
      name: 'DesignerAgent',
      systemPrompt: `You are an expert product designer and technical architect. Given a product idea, you create a complete design specification including:

1. TECH STACK: Choose the most appropriate stack for the project. Default to React + Vite + TypeScript + Tailwind CSS for web apps. For mobile apps, use React Native. For simple tools, vanilla JS is fine.

2. PAGES & COMPONENTS: Define every page, route, and component needed. Keep it MVP-minimal but complete.

3. DATA MODEL: Define entities and fields. Use localStorage for simple apps, or specify backend needs.

4. UI SPECS: Define theme, colors, layout style. Make it look professional and modern.

5. BUILDER SPECS (CRITICAL): Analyze the project and determine what parallel builder agents are needed. Examples:
   - Simple SPA: [{type: "frontend", label: "Frontend Builder", files: ["src/"]}]
   - Full-stack app: [{type: "frontend", ...}, {type: "backend", ...}, {type: "database", ...}]
   - Chrome extension: [{type: "extension-core", ...}, {type: "popup-ui", ...}, {type: "background-script", ...}]
   - API service: [{type: "api-server", ...}, {type: "docs", ...}]
   Each builder spec lists the files/directories that builder is responsible for.

   Common builder types:
   - "frontend" — UI components, pages, routing, styles
   - "backend" — API server, routes, middleware
   - "database" — Schema, migrations, seed data
   - "extension-core" — manifest.json, permissions, service worker
   - "popup-ui" — Extension popup interface
   - "background-script" — Extension background logic
   - "api-server" — REST/GraphQL API
   - "docs" — Documentation, README
   - "config" — Build config, env setup, package.json
   - "auth" — Authentication system
   - "testing" — Test suite setup

   The builder specs determine which parallel agents will be spawned in the build phase.

Be specific and actionable. Each spec should be buildable by a code-generating agent without additional context.

ALWAYS include a "config" builder for project setup (package.json, tsconfig, vite config, etc).

Respond in valid JSON only.`,
      model: config.model,
      maxTokens: 8192,
      temperature: 0.5,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
  }

  async run(idea: IdeaArtifact): Promise<DesignArtifact> {
    logger.info('DESIGNER', `Designing: "${idea.tagline}"`);

    const prompt = `Design the complete technical specification for this product idea:

TAGLINE: ${idea.tagline}
FEATURES: ${idea.features.map((f, i) => `${i + 1}. ${f}`).join('\n')}
TARGET USER: ${idea.targetUser}
KEY INSIGHTS: ${idea.keyInsights.join('\n')}
DEBATE SUMMARY: ${idea.debateSummary}
CONFIDENCE: ${idea.confidence}

Provide a COMPLETE design specification as valid JSON. Include:
- techStack: string describing the full tech stack
- pages: array of {name, route, description, components: [{name, type, description}]}
- dataModel: {entities: {EntityName: {fields: {fieldName: {type, required}}}}}
- uiSpec: {theme, primaryColor, layout, style}
- dependencies: array of npm package names
- builderSpecs: array of {type, label, description, files, dependencies}
- projectStructure: object mapping directory/file paths to their purpose

The builderSpecs are CRITICAL — they determine which parallel builder agents will be spawned. Analyze the project type and include all necessary builders. Always include a "config" builder for project scaffolding.`;

    const response = await this.chat(
      [{ role: 'user', content: prompt }],
      8192
    );

    // Parse JSON from response
    const jsonStr = this.extractJson(response);
    const design = JSON.parse(jsonStr) as Partial<DesignArtifact>;

    // Ensure builderSpecs always includes config
    if (!design.builderSpecs) {
      design.builderSpecs = [];
    }
    if (!design.builderSpecs.some((s) => s.type === 'config')) {
      design.builderSpecs.unshift({
        type: 'config',
        label: 'Config Builder',
        description: 'Project scaffolding: package.json, configs, build setup',
        files: [
          'package.json',
          'tsconfig.json',
          'vite.config.ts',
          'index.html',
          '.gitignore',
        ],
        dependencies: [],
      });
    }

    // Ensure defaults for every field so downstream agents never crash
    design.pages = design.pages || [];
    design.dataModel = design.dataModel || { entities: {} };
    design.techStack = design.techStack || 'React + Vite + TypeScript + Tailwind CSS';
    design.uiSpec = design.uiSpec || {
      theme: 'light',
      primaryColor: '#3B82F6',
      layout: 'responsive',
      style: 'modern',
    };
    design.dependencies = design.dependencies || [];
    design.projectStructure = design.projectStructure || {};

    logger.info(
      'DESIGNER',
      `Pages: ${design.pages.length}, Builders: ${design.builderSpecs.length}`
    );
    logger.info(
      'DESIGNER',
      `Builders: ${design.builderSpecs.map((s) => s.label).join(', ')}`
    );

    return design as DesignArtifact;
  }

  // ----------------------------------------------------------------
  // JSON extraction — tries multiple strategies for robustness
  // ----------------------------------------------------------------

  private extractJson(text: string): string {
    // Strategy 1: direct parse
    try {
      JSON.parse(text);
      return text;
    } catch {
      // continue
    }

    // Strategy 2: fenced code block (```json ... ```)
    const fencedRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
    const fencedMatch = text.match(fencedRegex);
    if (fencedMatch) {
      const candidate = fencedMatch[1];
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // fenced content isn't valid JSON either — fall through
      }
    }

    // Strategy 3: find the outermost balanced { … }
    const start = text.indexOf('{');
    if (start !== -1) {
      const candidate = this.extractBalancedBraces(text, start);
      if (candidate) {
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // continue
        }
      }
    }

    // Strategy 4: try every { as a starting point (slow but thorough)
    let idx = 0;
    while ((idx = text.indexOf('{', idx)) !== -1) {
      const candidate = this.extractBalancedBraces(text, idx);
      if (candidate) {
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          idx++;
        }
      } else {
        idx++;
      }
    }

    throw new Error(
      `No valid JSON found in designer response (length: ${text.length})`
    );
  }

  /**
   * Starting at the given index, walk forward counting brace depth.
   * Returns the substring from start up to (and including) the matching
   * closing brace when depth returns to 0.  Returns null if no match.
   */
  private extractBalancedBraces(
    text: string,
    start: number
  ): string | null {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
    return null;
  }
}
