// ============================================================
// IdeaGen Arena — round-table group chat. Short turns, natural
// back-and-forth, moderator steers and converges.
// Each response is a group-chat message (50-150 words), not an essay.
// ============================================================

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { BaseAgent } from '../../core/agent.js';
import { DEFAULT_MODELS } from '../../core/config.js';
import { logger } from '../../utils/logger.js';
import type { IdeaArtifact } from '../../types/artifacts.js';
import { DEBATE_ROLES } from './roles.js';
import type { EventBus } from '../../observability/event-bus.js';

export interface IdeaGenConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  verbose: boolean;
  eventBus?: EventBus;
  language?: string;
}

interface TranscriptEntry {
  turn: number;
  role: string;
  content: string;
}

interface SpeakerState {
  counts: Record<string, number>;
  lastSpokenAt: Record<string, number>;
}

export class IdeaGenArena extends BaseAgent {
  private transcript: TranscriptEntry[] = [];
  private arenaConfig: IdeaGenConfig;
  private bus?: EventBus;

  private readonly maxTurns = 24;
  private readonly modInterval = 5;

  constructor(config: IdeaGenConfig) {
    super({
      name: 'IdeaGenArena',
      systemPrompt: 'You are the moderator of a creative debate arena.',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      maxTokens: 8192,
      temperature: 0.9,
    });
    this.arenaConfig = config;
    this.bus = config.eventBus;
  }

  private get model(): string {
    return this.config.model || DEFAULT_MODELS.ideaGen;
  }

  // -------------------------------------------------------
  // Language instruction
  // -------------------------------------------------------
  private langInstruction(): string {
    const lang = this.arenaConfig.language || 'en';
    if (lang === 'zh' || lang === 'zh-CN' || lang.startsWith('zh')) {
      return 'OUTPUT LANGUAGE: Chinese (中文). Every response MUST be entirely in Chinese.';
    }
    if (lang === 'ja' || lang.startsWith('ja')) {
      return 'OUTPUT LANGUAGE: Japanese (日本語). Every response MUST be entirely in Japanese.';
    }
    if (lang === 'ko' || lang.startsWith('ko')) {
      return 'OUTPUT LANGUAGE: Korean (한국어). Every response MUST be entirely in Korean.';
    }
    return '';
  }

  // -------------------------------------------------------
  // Streaming — with correct system prompt
  // -------------------------------------------------------
  private async streamResponse(
    role: string,
    round: string,
    system: string,
    userContent: string,
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    let text = '';
    logger.info(role, `▶ ${round}...`);
    process.stdout.write('\n');

    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user' as const, content: userContent }],
        stream: true,
      });
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          process.stdout.write(chunk.delta.text);
          text += chunk.delta.text;
        }
      }
    } catch {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user' as const, content: userContent }],
      });
      text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as any).text)
        .join('\n');
      logger.success(role, `Response (${text.length} chars):`);
      console.log(text);
      console.log('');
    }

    process.stdout.write('\n\n');
    logger.success(role, `${round} complete (${text.length} chars)`);
    return text;
  }

  // -------------------------------------------------------
  // Transcript management
  // -------------------------------------------------------
  private addEntry(turn: number, role: string, content: string): void {
    this.transcript.push({ turn, role, content });
  }

  private formatRecentEntries(n: number): string {
    const entries = this.transcript.slice(-n);
    return entries.map((e) => `[${e.role}]: ${e.content}`).join('\n\n');
  }

  private formatFullTranscript(): string {
    return this.transcript.map((e) => `[${e.role}]: ${e.content}`).join('\n\n');
  }

  // -------------------------------------------------------
  // Moderator: steering message + optional speaker suggestion
  // -------------------------------------------------------
  private async moderatorSteer(
    turn: number,
    speakerState: SpeakerState,
    phase: 'opening' | 'exploration' | 'debate' | 'convergence'
  ): Promise<{ steeringMessage: string; suggestedSpeaker?: string }> {
    const roleNames = DEBATE_ROLES.map((r) => r.codeName).join(', ');
    const recent = this.formatRecentEntries(8);
    const langInstr = this.langInstruction();

    const turnSummary = Object.entries(speakerState.counts)
      .map(([k, v]) => `  ${k}: ${v} turns`)
      .join('\n');

    const phaseGoal =
      phase === 'opening' ? 'Each role should share their initial perspective on the topic.'
      : phase === 'exploration' ? 'Explore different angles. Find points of agreement and disagreement.'
      : phase === 'debate' ? 'Challenge specific claims. Push for concrete evidence. Resolve contradictions.'
      : 'Focus on convergence. What should the final product include? What should be cut?';

    const systemPrompt = `You moderate a product discussion among 6 specialists. Your job:
1. Briefly summarize the current state (1-2 sentences)
2. Optionally suggest who should speak next (only if a specific role is needed)
3. Give a short steering message to the group

IMPORTANT: You are NOT the dictator of turn order. Roles can naturally respond to each other via mentions. Only suggest a speaker if a specific perspective is needed.`;

    const text = await this.streamResponse(
      'Moderator',
      `steer (turn ${turn})`,
      `${systemPrompt}${langInstr ? '\n\n' + langInstr : ''}`,
      `Discussion so far:

${recent}

Turn counts:
${turnSummary}

Phase goal: ${phaseGoal}
All roles: ${roleNames}

Respond:
1. Brief summary of where we are
2. NEXT: {codeName} — reason (optional, only if needed)
3. Steering message to the group`,
      512,
      0.5
    );

    const nextMatch = text.match(/NEXT:\s*(\w+)/i);
    const suggestedSpeaker = nextMatch ? nextMatch[1] : undefined;

    return { steeringMessage: text, suggestedSpeaker };
  }

  // -------------------------------------------------------
  // Role turn — SHORT, group-chat style
  // -------------------------------------------------------
  private async roleTurn(
    roleCodeName: string,
    turn: number,
    moderatorPrompt?: string
  ): Promise<string> {
    const debateRole = DEBATE_ROLES.find((r) => r.codeName === roleCodeName);
    if (!debateRole) throw new Error(`Unknown role: ${roleCodeName}`);

    const langInstr = this.langInstruction();

    const systemPrompt = `${debateRole.systemPrompt}

${langInstr}

You are in a group chat. You are ${debateRole.name}.

CRITICAL RULES:
1. Response must be SHORT: 2-4 sentences, 50-150 words maximum. This is a chat message, not an essay.
2. Only speak for yourself. Never simulate other roles.
3. Respond directly to the most recent points. Address other roles by name (e.g., "Engineer, you're ignoring...").
4. If you want a specific role to respond next, explicitly name them: "@RoleName" or "RoleName, what do you think?"
5. If you agree with someone, say so briefly and add your perspective.
6. If you disagree, state why specifically and give a concrete reason.
7. If the moderator asked you a question, answer it directly.
8. If you have nothing new to add, say "I agree with [name]'s point" and yield.`;

    const recent = this.formatRecentEntries(10);
    const modContext = moderatorPrompt
      ? `The moderator just said:\n${moderatorPrompt}\n\n`
      : '';

    const userContent = `${modContext}Group chat history:

${recent}

You are ${debateRole.name}. It's your turn. Respond in 2-4 sentences. Be specific, address others by name, and make your point clearly.`;

    return this.streamResponse(
      roleCodeName,
      `turn ${turn}`,
      systemPrompt,
      userContent,
      512,
      0.9
    );
  }

  // -------------------------------------------------------
  // Mention detection — hybrid trigger (priority 1)
  // -------------------------------------------------------
  private detectNextSpeaker(
    lastContent: string,
    speakerState: SpeakerState
  ): string | null {
    // Pattern 1: "RoleName，..." / "RoleName, ..." / "Hey RoleName"
    // Pattern 2: "@RoleName"
    const roleNames = DEBATE_ROLES.map((r) => r.codeName);
    const mentionPattern = new RegExp(`[@]?\\b(${roleNames.join('|')})\\b`, 'gi');
    const matches = lastContent.match(mentionPattern);

    if (matches) {
      // Return the first mentioned valid role
      for (const m of matches) {
        const normalized = m.replace('@', '');
        if (roleNames.includes(normalized)) {
          return normalized;
        }
      }
    }

    return null;
  }

  // -------------------------------------------------------
  // Hybrid speaker selection: mention → moderator override → round-robin
  // -------------------------------------------------------
  private selectNextSpeaker(
    lastContent: string,
    speakerState: SpeakerState,
    lastSpeaker: string,
    moderatorPick?: string
  ): string {
    // Priority 1: mention detected → mentioned role speaks
    const mentioned = this.detectNextSpeaker(lastContent, speakerState);
    if (mentioned && mentioned !== lastSpeaker) {
      return mentioned;
    }

    // Priority 2: moderator override (steering turn)
    if (moderatorPick && moderatorPick !== lastSpeaker) {
      return moderatorPick;
    }

    // Priority 3: heuristic round-robin (least recent speaker)
    return this.heuristicPick(speakerState);
  }

  // -------------------------------------------------------
  // Heuristic speaker pick (fallback when no mention/moderator)
  // -------------------------------------------------------
  private heuristicPick(speakerState: SpeakerState): string {
    const roleNames = DEBATE_ROLES.map((r) => r.codeName);
    const sorted = [...roleNames].sort(
      (a, b) => (speakerState.lastSpokenAt[a] ?? -1) - (speakerState.lastSpokenAt[b] ?? -1)
    );
    const candidates = sorted.slice(0, 2).sort(
      (a, b) => (speakerState.counts[a] ?? 0) - (speakerState.counts[b] ?? 0)
    );
    return candidates[0];
  }

  // -------------------------------------------------------
  // Phase detection
  // -------------------------------------------------------
  private getPhase(turn: number, silentTurns: number): 'opening' | 'exploration' | 'debate' | 'convergence' {
    if (turn <= 4) return 'opening';
    if (turn <= 8) return 'exploration';
    if (silentTurns >= 2) return 'convergence';
    return 'debate';
  }

  // -------------------------------------------------------
  // Main: round-table discussion
  // -------------------------------------------------------
  async run(input?: unknown): Promise<IdeaArtifact> {
    const prompt =
      typeof input === 'string' && input.length > 0
        ? input
        : 'Generate a creative, feasible MVP product idea that can be built as a web application';

    logger.box('CREATIVE ARENA: Round-Table Discussion');
    logger.info('ARENA', `Topic: ${prompt}`);
    logger.info('ROLES', DEBATE_ROLES.map((r) => `${r.codeName} (${r.name})`).join(', '));

    // Turn 0: Moderator opens
    logger.info('MODERATOR', 'Opening the discussion...');
    const opening = await this.moderatorOpening(prompt);
    this.addEntry(0, 'Moderator', opening);

    // Speaker state
    const speakerState: SpeakerState = { counts: {}, lastSpokenAt: {} };
    for (const r of DEBATE_ROLES) {
      speakerState.counts[r.codeName] = 0;
      speakerState.lastSpokenAt[r.codeName] = -1;
    }

    // Round-table loop
    let consecutiveSilent = 0; // turns where role says "I agree, nothing to add"
    let lastSpeaker = '';
    let lastContent = '';
    let moderatorPick: string | undefined;

    // First speaker after opening: LLM-suggested or heuristic
    const firstResult = await this.moderatorSteer(1, speakerState, 'opening');
    moderatorPick = firstResult.suggestedSpeaker;

    let nextSpeaker = this.selectNextSpeaker('', speakerState, '', moderatorPick);

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      // Moderator steering every modInterval turns (not turn 1, already did opening steer)
      let moderatorMsg = '';
      if (turn > 1 && turn % this.modInterval === 0) {
        const phase = this.getPhase(turn, consecutiveSilent);
        if (phase === 'convergence') {
          logger.info('MODERATOR', 'Convergence signal...');
        }
        const result = await this.moderatorSteer(turn, speakerState, phase);
        moderatorMsg = result.steeringMessage;
        moderatorPick = result.suggestedSpeaker;
        this.addEntry(turn, 'Moderator', moderatorMsg);

        if (this.bus) {
          this.bus.emit({
            type: 'moderator_summary',
            phase: 'idea',
            role: 'Moderator',
            content: moderatorMsg,
            meta: { turn, suggestedSpeaker: moderatorPick || 'auto' },
          });
        }
      }

      // Select next speaker using hybrid trigger
      if (turn > 1) {
        nextSpeaker = this.selectNextSpeaker(
          lastContent, speakerState, lastSpeaker, moderatorPick
        );
        moderatorPick = undefined; // clear after use, only applies once
      }

      const role = DEBATE_ROLES.find((r) => r.codeName === nextSpeaker)
        ?? DEBATE_ROLES[0];

      logger.info(`TURN ${turn}/${this.maxTurns}`, `${role.name} (${role.codeName})`);

      const content = await this.roleTurn(role.codeName, turn, moderatorMsg);
      this.addEntry(turn, role.codeName, content);

      if (this.bus) {
        this.bus.emit({
          type: turn <= 6 ? 'role_pitch' : 'role_speak',
          phase: 'idea',
          role: role.codeName,
          content,
          meta: { turn },
        });
      }

      // Detect "silent" turns (agree + no new content)
      const isSilent = content.length < 80 || /agree.*yield/i.test(content);
      consecutiveSilent = isSilent ? consecutiveSilent + 1 : 0;

      // Update state
      speakerState.counts[role.codeName] = (speakerState.counts[role.codeName] ?? 0) + 1;
      speakerState.lastSpokenAt[role.codeName] = turn;

      lastSpeaker = role.codeName;
      lastContent = content;

      // Early convergence: 3+ silent turns in a row
      if (consecutiveSilent >= 3) {
        logger.info('CONVERGENCE', 'Discussion has naturally converged.');
        break;
      }
    }

    // Final synthesis
    logger.info('SYNTHESIS', 'Moderator producing final idea...');
    const synthesis = await this.finalSynthesis();
    const winner = await this.scoreAndSelect(synthesis);
    return this.formatIdea(winner);
  }

  // -------------------------------------------------------
  // Moderator Opening
  // -------------------------------------------------------
  private async moderatorOpening(userPrompt: string): Promise<string> {
    const roleList = DEBATE_ROLES.map((r) => `- ${r.name} (${r.codeName})`).join('\n');
    const langInstr = this.langInstruction();

    const text = await this.streamResponse(
      'Moderator',
      'opening',
      `You moderate a creative product discussion.${langInstr ? '\n\n' + langInstr : ''}`,
      `Welcome everyone. Topic: ${userPrompt}

Participants:
${roleList}

Opening: introduce the topic and each person's lens in 2-3 sentences. Then invite the first speaker. Keep it brief (50-100 words).`,
      512,
      0.7
    );

    if (this.bus) {
      this.bus.emit({
        type: 'role_pitch',
        phase: 'idea',
        role: 'Moderator',
        content: text,
        meta: { charCount: text.length },
      });
    }

    return text;
  }

  // -------------------------------------------------------
  // Final Synthesis
  // -------------------------------------------------------
  private async finalSynthesis(): Promise<string> {
    const full = this.formatFullTranscript();
    const langInstr = this.langInstruction();

    const response = await this.chat(
      [
        {
          role: 'user' as const,
          content: `You are the moderator. The discussion is complete.

${langInstr ? langInstr + '\n\n' : ''}Full discussion (${this.transcript.length} turns):

${full}

Synthesize the best product idea. Extract the strongest elements, resolve contradictions, present ONE refined idea:
- Tagline: one-line description
- Features: 3-5 core features
- Target User: who would use this
- Key Insights: key insights from the debate
- Confidence: 0.0-1.0`,
        },
      ],
      4096
    );

    logger.success('SYNTHESIS', `Final idea (${response.length} chars):`);
    console.log(response);
    console.log('');

    if (this.bus) {
      this.bus.emit({
        type: 'synthesis',
        phase: 'idea',
        role: 'Moderator',
        content: response,
        meta: { charCount: response.length },
      });
    }

    return response;
  }

  // -------------------------------------------------------
  // Scoring
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
      logger.info('SCORING', `Scores: ${JSON.stringify(scores)}`);
      if (this.bus) {
        this.bus.emit({
          type: 'scoring',
          phase: 'idea',
          role: 'Scorer',
          content: JSON.stringify(scores),
          meta: { ...scores },
        });
      }
      return { synthesis, scores };
    } catch {
      logger.warn('SCORING', 'Failed to parse scores — using empty scores');
      return { synthesis, scores: {} };
    }
  }

  // -------------------------------------------------------
  // Format as IdeaArtifact
  // -------------------------------------------------------
  private formatIdea(
    result: { synthesis: string; scores: Record<string, number> }
  ): IdeaArtifact {
    const s = result.synthesis;

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
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

    const features: string[] = [];
    if (featuresMatch) {
      features.push(
        ...featuresMatch[1].trim().split('\n')
          .map((l) => l.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean)
      );
    }

    const keyInsights: string[] = [];
    if (insightsMatch) {
      keyInsights.push(
        ...insightsMatch[1].trim().split('\n')
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

    return {
      tagline,
      features,
      targetUser,
      debateSummary: `Synthesized from round-table discussion (${this.transcript.length} turns). Avg score: ${avgScore}.`,
      confidence,
      keyInsights,
    };
  }

  getDebateLog(): TranscriptEntry[] {
    return [...this.transcript];
  }

  getTranscript(): TranscriptEntry[] {
    return [...this.transcript];
  }
}
