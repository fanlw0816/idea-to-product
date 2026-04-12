// ============================================================
// IdeaGen Arena — 6-agent structured debate for product idea
// generation. Three rounds: Storm → Attack → Synthesis.
// ============================================================

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { BaseAgent } from '../../core/agent.js';
import { DEFAULT_MODELS } from '../../core/config.js';
import { logger } from '../../utils/logger.js';
import type { IdeaArtifact } from '../../types/artifacts.js';
import { DEBATE_ROLES, type DebateRole } from './roles.js';

export interface IdeaGenConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  verbose: boolean;
}

interface DebateMessage {
  from: string;
  content: string;
  targetType?: string;
  messageType: 'pitch' | 'attack' | 'defense' | 'concession' | 'synthesis';
}

export class IdeaGenArena extends BaseAgent {
  private debateLog: DebateMessage[] = [];
  private arenaConfig: IdeaGenConfig;

  constructor(config: IdeaGenConfig) {
    super({
      name: 'IdeaGenArena',
      systemPrompt:
        'You are the moderator of a creative debate arena. You facilitate a structured debate between 6 distinct personas to generate and refine product ideas.',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      maxTokens: 8192,
      temperature: 0.9,
    });
    this.arenaConfig = config;
  }

  // Get the effective model name for API calls
  private get model(): string {
    return this.config.model || DEFAULT_MODELS.ideaGen;
  }

  // -------------------------------------------------------
  // Main entry: run the full debate and return the winning idea
  // -------------------------------------------------------
  async run(input?: unknown): Promise<IdeaArtifact> {
    const prompt =
      typeof input === 'string' && input.length > 0
        ? input
        : 'Generate a creative, feasible MVP product idea that can be built as a web application';

    logger.box('CREATIVE ARENA: 6-Agent Debate');
    logger.info(
      'ARENA',
      `Prompt: ${prompt}`
    );
    logger.info(
      'ROLES',
      DEBATE_ROLES.map((r) => `${r.codeName} (${r.name})`).join(', ')
    );

    // Round 1: Each role pitches ideas from their perspective (PARALLEL)
    logger.info('ROUND 1', 'Storm: Each role pitches ideas...');
    const pitches = await this.round1Pitches(prompt);
    this.debateLog.push(...pitches);

    // Round 2: Attack & Defense (PARALLEL attacks)
    logger.info('ROUND 2', 'Attack: Roles critique each pitch...');
    const attacks = await this.round2Attacks(pitches);
    this.debateLog.push(...attacks);

    // Round 3: Synthesis & Convergence
    logger.info('ROUND 3', 'Synthesis: Converging on the best idea...');
    const synthesis = await this.round3Synthesis(pitches, attacks);

    // Score & select winner
    const winner = await this.scoreAndSelect(synthesis);

    // Format final output
    return this.formatIdea(winner);
  }

  // -------------------------------------------------------
  // Round 1: All 6 roles pitch in parallel
  // -------------------------------------------------------
  private async round1Pitches(userPrompt: string): Promise<DebateMessage[]> {
    const pitchPromises = DEBATE_ROLES.map(async (role) => {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        temperature: 0.9,
        system: `${role.systemPrompt}\n\nYou are in Round 1: Pitch your best product idea (1-3 ideas) based on your unique perspective. Each idea should include: name, one-line description, why it's valuable.`,
        messages: [
          { role: 'user' as const, content: `Debate prompt: ${userPrompt}` },
        ],
      });
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as any).text)
        .join('\n');
      logger.info(role.codeName, `Pitch: ${text.substring(0, 100)}...`);
      return {
        from: role.codeName,
        content: text,
        messageType: 'pitch' as const,
      };
    });
    return Promise.all(pitchPromises);
  }

  // -------------------------------------------------------
  // Round 2: Each role attacks the OTHER roles' pitches (parallel)
  // -------------------------------------------------------
  private async round2Attacks(
    pitches: DebateMessage[]
  ): Promise<DebateMessage[]> {
    const attackPromises = DEBATE_ROLES.map(async (role) => {
      const otherPitches = pitches.filter((p) => p.from !== role.codeName);
      const otherPitchesText = otherPitches
        .map((p) => `[${p.from}]: ${p.content}`)
        .join('\n---\n');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        temperature: 0.8,
        system: `${role.systemPrompt}\n\nYou are in Round 2: Attack the other roles' pitches. Point out flaws, competition, feasibility issues, scope problems, missing insights. Be specific and critical. If an idea is genuinely good, acknowledge it briefly but still challenge it.`,
        messages: [
          {
            role: 'user' as const,
            content: `Here are the pitches to critique:\n${otherPitchesText}`,
          },
        ],
      });
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as any).text)
        .join('\n');
      logger.info(role.codeName, `Attack: ${text.substring(0, 100)}...`);
      return {
        from: role.codeName,
        content: text,
        messageType: 'attack' as const,
      };
    });
    return Promise.all(attackPromises);
  }

  // -------------------------------------------------------
  // Round 3: Synthesize the best idea from the full debate
  // -------------------------------------------------------
  private async round3Synthesis(
    pitches: DebateMessage[],
    attacks: DebateMessage[]
  ): Promise<string> {
    const allContent = [...pitches, ...attacks]
      .map((m) => `[${m.from}] (${m.messageType}):\n${m.content}`)
      .join('\n\n');

    const response = await this.chat(
      [
        {
          role: 'user' as const,
          content: `Here is the complete debate transcript:\n\n${allContent}\n\nSynthesize the best product idea from this debate. Extract the strongest elements, resolve contradictions, and present ONE refined idea. The idea must be:\n1. A clear MVP scope (buildable in days, not months)\n2. Genuinely useful or interesting\n3. Technically feasible as a web app\n4. Differentiated from existing products\n\nOutput format:\n- Tagline: one-line description\n- Features: 3-5 core features\n- Target User: who would use this\n- Key Insights: key insights from the debate\n- Confidence: 0.0-1.0`,
        },
      ],
      4096
    );

    return response;
  }

  // -------------------------------------------------------
  // Score the synthesized idea on five dimensions
  // -------------------------------------------------------
  private async scoreAndSelect(
    synthesis: string
  ): Promise<{ synthesis: string; scores: Record<string, number> }> {
    const response = await this.chat(
      [
        {
          role: 'user' as const,
          content: `Score this idea on five dimensions (0-10):\n\n${synthesis}\n\nOutput ONLY a JSON like:\n{"novelty": N, "feasibility": N, "userValue": N, "timing": N, "scopeControl": N}`,
        },
      ],
      512
    );

    try {
      const jsonMatch = response.match(/\{[^}]+\}/);
      const scores = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      logger.info(
        'SCORING',
        `Scores: ${JSON.stringify(scores)}`
      );
      return { synthesis, scores };
    } catch {
      logger.warn('SCORING', 'Failed to parse scores — using empty scores');
      return { synthesis, scores: {} };
    }
  }

  // -------------------------------------------------------
  // Parse the synthesis into a structured IdeaArtifact
  // -------------------------------------------------------
  private formatIdea(
    result: { synthesis: string; scores: Record<string, number> }
  ): IdeaArtifact {
    const s = result.synthesis;

    // Parse the synthesis into structured format
    const taglineMatch = s.match(/[-*]?\s*Tagline:\s*(.+)/i);
    const featuresMatch = s.match(
      /[-*]?\s*Features?:\s*([\s\S]*?)(?:[-*]?\s*(?:Target|Key|Confidence|User))/i
    );
    const userMatch = s.match(/[-*]?\s*(?:Target\s*)?User:\s*(.+)/i);
    const insightsMatch = s.match(
      /[-*]?\s*(?:Key\s*)?Insights?:\s*([\s\S]*?)(?:[-*]?\s*(?:Confidence|Score))/i
    );
    const confidenceMatch = s.match(/[-*]?\s*Confidence:\s*([\d.]+)/i);

    const tagline = taglineMatch ? taglineMatch[1].trim() : 'TBD';
    const targetUser = userMatch ? userMatch[1].trim() : 'General users';
    const confidence = confidenceMatch
      ? parseFloat(confidenceMatch[1])
      : 0.5;

    const features: string[] = [];
    if (featuresMatch) {
      features.push(
        ...featuresMatch[1]
          .trim()
          .split('\n')
          .map((l) => l.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean)
      );
    }

    const keyInsights: string[] = [];
    if (insightsMatch) {
      keyInsights.push(
        ...insightsMatch[1]
          .trim()
          .split('\n')
          .map((l) => l.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean)
      );
    }

    const avgScore =
      Object.keys(result.scores).length > 0
        ? (Object.values(result.scores).reduce((a, b) => a + b, 0) /
            Object.values(result.scores).length /
            10).toFixed(2)
        : 'N/A';

    const debateSummary =
      `Synthesized from 6-role debate. ` +
      `Scores: ${JSON.stringify(result.scores)}. ` +
      `Avg: ${avgScore}.`;

    return {
      tagline,
      features,
      targetUser,
      debateSummary,
      confidence,
      keyInsights,
    };
  }

  // Expose the full debate log for debugging/inspection
  getDebateLog(): DebateMessage[] {
    return [...this.debateLog];
  }
}
