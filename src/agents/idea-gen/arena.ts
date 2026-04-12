// ============================================================
// IdeaGen Arena — group-chat style multi-agent debate.
// Moderator opens, roles respond naturally to each other,
// moderator steers every N turns, then converges to a conclusion.
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
  messageType: 'pitch' | 'speak' | 'defense' | 'moderator' | 'synthesis';
}

interface SpeakerState {
  counts: Record<string, number>;
  lastSpokenAt: Record<string, number>;
}

export class IdeaGenArena extends BaseAgent {
  private transcript: TranscriptEntry[] = [];
  private arenaConfig: IdeaGenConfig;
  private bus?: EventBus;

  private readonly maxTurns = 18;
  private readonly modInterval = 4;

  constructor(config: IdeaGenConfig) {
    super({
      name: 'IdeaGenArena',
      systemPrompt:
        'You are the moderator of a creative debate arena.',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      maxTokens: 8192,
      temperature: 0.9,
    });
    this.arenaConfig = config;
    this.bus = config.eventBus;
  }

  // Get the effective model name for API calls
  private get model(): string {
    return this.config.model || DEFAULT_MODELS.ideaGen;
  }

  // Language instruction for system prompts
  private langInstruction(): string {
    const lang = this.arenaConfig.language || 'en';
    if (lang === 'zh' || lang === 'zh-CN' || lang.startsWith('zh')) {
      return 'OUTPUT LANGUAGE: Chinese (中文). Every single response MUST be written entirely in Chinese. Do not use English except for technical terms that have no common Chinese equivalent.';
    }
    if (lang === 'ja' || lang.startsWith('ja')) {
      return 'OUTPUT LANGUAGE: Japanese (日本語). Every single response MUST be written entirely in Japanese.';
    }
    if (lang === 'ko' || lang.startsWith('ko')) {
      return 'OUTPUT LANGUAGE: Korean (한국어). Every single response MUST be written entirely in Korean.';
    }
    return '';
  }

  // -------------------------------------------------------
  // Main entry: group chat debate
  // -------------------------------------------------------
  async run(input?: unknown): Promise<IdeaArtifact> {
    const prompt =
      typeof input === 'string' && input.length > 0
        ? input
        : 'Generate a creative, feasible MVP product idea that can be built as a web application';

    logger.box('CREATIVE ARENA: Group Chat Debate');
    logger.info('ARENA', `Topic: ${prompt}`);
    logger.info(
      'ROLES',
      DEBATE_ROLES.map((r) => `${r.codeName} (${r.name})`).join(', ')
    );

    // Turn 0: Moderator opens
    logger.info('TURN 0', 'Moderator opening the debate...');
    const opening = await this.moderatorOpening(prompt);
    this.addEntry(0, 'Moderator', opening, 'moderator');

    // Turns 1..maxTurns: Group chat loop
    logger.info('GROUP CHAT', `Starting ${this.maxTurns} turns of debate...`);
    const speakerState: SpeakerState = {
      counts: {},
      lastSpokenAt: {},
    };
    for (const r of DEBATE_ROLES) {
      speakerState.counts[r.codeName] = 0;
      speakerState.lastSpokenAt[r.codeName] = -1;
    }

    await this.groupChatLoop(prompt, speakerState);

    // Final synthesis
    logger.info('SYNTHESIS', 'Moderator converging on final idea...');
    const synthesis = await this.finalSynthesis();

    // Score
    const winner = await this.scoreAndSelect(synthesis);

    // Format
    return this.formatIdea(winner);
  }

  // -------------------------------------------------------
  // Streaming helper — FIXED to use the passed system prompt
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
      // Streaming not supported by proxy — fall back to non-streaming
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
  private addEntry(
    turn: number,
    role: string,
    content: string,
    messageType: TranscriptEntry['messageType']
  ): void {
    this.transcript.push({ turn, role, content, messageType });
  }

  private formatTranscript(maxEntries?: number): string {
    const entries =
      maxEntries !== undefined
        ? this.transcript.slice(-maxEntries)
        : this.transcript;

    return entries
      .map(
        (e) =>
          `[Turn ${e.turn}] ${e.role}: ${e.content}`
      )
      .join('\n\n');
  }

  private getTruncatedTranscript(maxChars = 6000): string {
    const full = this.formatTranscript();
    if (full.length <= maxChars) return full;

    // Keep opening + recent entries
    const opening = this.transcript[0];
    const recent = this.transcript.slice(-12);
    const entries = opening && !recent.includes(opening)
      ? [opening, ...recent]
      : recent;

    return entries
      .map((e) => `[Turn ${e.turn}] ${e.role}: ${e.content}`)
      .join('\n\n');
  }

  private getPhase(turn: number): string {
    const third = Math.ceil(this.maxTurns / 3);
    if (turn <= third) return 'opening';
    if (turn <= third * 2) return 'debate';
    return 'convergence';
  }

  private getPhaseInstruction(phase: string): string {
    switch (phase) {
      case 'opening':
        return 'This is the opening phase. Pitch your perspective on the product idea from your unique viewpoint.';
      case 'debate':
        return 'The debate is underway. Challenge other positions, defend your own, respond to specific points made by others, and find common ground.';
      case 'convergence':
        return 'We are converging. Focus on the strongest elements from the discussion. What should the final idea include and what should be cut?';
      default:
        return '';
    }
  }

  // -------------------------------------------------------
  // Turn 0: Moderator Opening
  // -------------------------------------------------------
  private async moderatorOpening(userPrompt: string): Promise<string> {
    const roleList = DEBATE_ROLES.map(
      (r) => `- ${r.name} (${r.codeName}): ${r.debateStyle}`
    ).join('\n');

    const langInstr = this.langInstruction();

    const systemPrompt = `You are the moderator of a creative debate arena. You facilitate a structured debate between 6 distinct personas to generate and refine product ideas.

Your role:
1. Open the discussion by introducing the topic and the participants
2. Observe the conversation, identify key points of agreement and disagreement
3. Interject periodically to steer the discussion back on track
4. Guide the group toward convergence on the best idea
5. Produce a final synthesized product idea`;

    const text = await this.streamResponse(
      'Moderator',
      'opening',
      `${systemPrompt}${langInstr ? '\n\n' + langInstr : ''}`,
      `Welcome to the Creative Debate Arena. Today's topic: ${userPrompt}

The participants are:
${roleList}

Please open the debate. Introduce the topic, briefly mention each participant's lens, and invite the first speaker. Keep it concise (100-200 words).`,
      2048,
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
  // Single role turn — reads full transcript, responds naturally
  // -------------------------------------------------------
  private async roleTurn(
    roleCodeName: string,
    turn: number
  ): Promise<string> {
    const debateRole = DEBATE_ROLES.find((r) => r.codeName === roleCodeName);
    if (!debateRole) {
      throw new Error(`Unknown role: ${roleCodeName}`);
    }

    const phase = this.getPhase(turn);
    const phaseInstruction = this.getPhaseInstruction(phase);
    const langInstr = this.langInstruction();

    const systemPrompt = `${debateRole.systemPrompt}

${langInstr}

You are participating in a group chat debate about a product idea. You are ONE participant — ${debateRole.name} (${roleCodeName}).

RULES:
1. Only speak for yourself. Never simulate, summarize, or speak on behalf of other roles.
2. You can address specific roles by name (e.g., "TrendHunter, you're missing...").
3. You can build on points made by others, challenge them, or introduce new angles.
4. Keep your response concise (200-500 words). This is a conversation, not an essay.
5. If you have nothing new to add, say so briefly and yield the floor.

CURRENT PHASE: ${phase}
${phaseInstruction}`;

    const transcriptText = this.getTruncatedTranscript();
    const userContent = `--- Group Chat Transcript (${this.transcript.length} entries so far) ---

${transcriptText}

---

You are ${debateRole.name} (${roleCodeName}). It's your turn to speak (Turn ${turn}).
Read the transcript above and respond naturally. Address other roles by name when relevant.`;

    const text = await this.streamResponse(
      roleCodeName,
      `turn ${turn}`,
      systemPrompt,
      userContent,
      2048,
      phase === 'convergence' ? 0.7 : 0.9
    );

    return text;
  }

  // -------------------------------------------------------
  // Moderator interjection — steers discussion every N turns
  // -------------------------------------------------------
  private async moderatorInterjection(turn: number): Promise<{
    message: string;
    nextSpeaker: string;
  }> {
    const langInstr = this.langInstruction();
    const roleNames = DEBATE_ROLES.map((r) => r.codeName).join(', ');
    const recentTranscript = this.formatTranscript(10);

    const systemPrompt = `You are the moderator of a creative debate arena. Your job is to:
1. Briefly summarize where the debate stands
2. Identify the most important unresolved question
3. Direct a specific role to address it
4. Nominate who should speak next`;

    const text = await this.streamResponse(
      'Moderator',
      `steering (turn ${turn})`,
      `${systemPrompt}${langInstr ? '\n\n' + langInstr : ''}`,
      `The group chat debate has reached turn ${turn}. Here is the recent conversation:

---
${recentTranscript}
---

All available roles: ${roleNames}

Please:
1. Summarize where the debate stands (2-3 sentences)
2. Identify the most important unresolved question
3. Nominate the NEXT speaker from the available roles (pick someone who hasn't spoken recently and has a relevant perspective)
4. Give a brief steering message to the group

End your response with: NEXT_SPEAKER: {codeName}`,
      1024,
      0.5
    );

    // Extract next speaker
    const nextMatch = text.match(/NEXT_SPEAKER:\s*(\w+)/i);
    const nextSpeaker = nextMatch ? nextMatch[1] : this.heuristicNextSpeaker();

    return { message: text, nextSpeaker };
  }

  // -------------------------------------------------------
  // Heuristic speaker selection (zero API calls)
  // -------------------------------------------------------
  private heuristicNextSpeaker(
    speakerState?: SpeakerState
  ): string {
    const roleNames = DEBATE_ROLES.map((r) => r.codeName);

    if (!speakerState) {
      // Fallback: just rotate through roles
      const spokenCount = this.transcript.filter(
        (e) => e.role !== 'Moderator'
      ).length;
      return roleNames[spokenCount % roleNames.length];
    }

    // Find roles that spoke least recently
    const sorted = [...roleNames].sort(
      (a, b) =>
        (speakerState.lastSpokenAt[a] ?? -1) -
        (speakerState.lastSpokenAt[b] ?? -1)
    );

    // Among the 2 least-recent speakers, pick the one with fewer total turns
    const candidates = sorted.slice(0, 2);
    candidates.sort(
      (a, b) =>
        (speakerState.counts[a] ?? 0) - (speakerState.counts[b] ?? 0)
    );

    return candidates[0];
  }

  // -------------------------------------------------------
  // Main group chat loop
  // -------------------------------------------------------
  private async groupChatLoop(
    userPrompt: string,
    speakerState: SpeakerState
  ): Promise<void> {
    let currentSpeakerIdx = 0;
    let modTurnsUsed = 0;

    for (let turn = 1; turn <= this.maxTurns; turn++) {
      // Moderator interjection every modInterval turns
      if (turn > 1 && turn % this.modInterval === 1) {
        logger.info('MODERATOR', `Interjecting at turn ${turn}...`);
        const interjection = await this.moderatorInterjection(turn);
        this.addEntry(turn, 'Moderator', interjection.message, 'moderator');
        modTurnsUsed++;

        if (this.bus) {
          this.bus.emit({
            type: 'moderator_summary',
            phase: 'idea',
            role: 'Moderator',
            content: interjection.message,
            meta: { turn, nextSpeaker: interjection.nextSpeaker },
          });
        }

        // Use moderator's nominated speaker, or fall back to heuristic
        const nominatedIdx = DEBATE_ROLES.findIndex(
          (r) => r.codeName === interjection.nextSpeaker
        );
        if (nominatedIdx >= 0) {
          currentSpeakerIdx = nominatedIdx;
        } else {
          // Fall back to heuristic using current speaker state
          const fallbackRole = this.heuristicNextSpeaker(speakerState);
          const fallbackIdx = DEBATE_ROLES.findIndex(
            (r) => r.codeName === fallbackRole
          );
          if (fallbackIdx >= 0) {
            currentSpeakerIdx = fallbackIdx;
          }
        }
      }

      // Select speaker via heuristic
      const role = DEBATE_ROLES[currentSpeakerIdx % DEBATE_ROLES.length];

      // Emit event
      if (this.bus) {
        const eventType =
          turn <= 6 ? 'role_pitch' : 'role_speak';
        this.bus.emit({
          type: eventType,
          phase: 'idea',
          role: role.codeName,
          content: '', // content filled after turn completes
          meta: { turn, phase: this.getPhase(turn) },
        });
      }

      logger.info(
        `TURN ${turn}/${this.maxTurns}`,
        `${role.name} (${role.codeName}) speaking...`
      );

      const content = await this.roleTurn(role.codeName, turn);

      this.addEntry(
        turn,
        role.codeName,
        content,
        turn <= 6 ? 'pitch' : 'speak'
      );

      // Update speaker state
      speakerState.counts[role.codeName] =
        (speakerState.counts[role.codeName] ?? 0) + 1;
      speakerState.lastSpokenAt[role.codeName] = turn;

      // Move to next speaker (skip the one that just spoke)
      currentSpeakerIdx = (currentSpeakerIdx + 1) % DEBATE_ROLES.length;
      // Skip if this role already spoke most recently (avoid back-to-back from moderator steering)
      if (
        currentSpeakerIdx < DEBATE_ROLES.length &&
        speakerState.lastSpokenAt[DEBATE_ROLES[currentSpeakerIdx].codeName] === turn
      ) {
        currentSpeakerIdx = (currentSpeakerIdx + 1) % DEBATE_ROLES.length;
      }
    }
  }

  // -------------------------------------------------------
  // Final synthesis — moderator reads full transcript and concludes
  // -------------------------------------------------------
  private async finalSynthesis(): Promise<string> {
    const fullTranscript = this.formatTranscript();
    const langInstr = this.langInstruction();

    const response = await this.chat(
      [
        {
          role: 'user' as const,
          content: `You are the moderator. The group chat debate is complete.

${langInstr ? langInstr + '\n\n' : ''}Full debate transcript (${this.transcript.length} turns):

${fullTranscript}

Synthesize the best product idea from this debate. Extract the strongest elements, resolve contradictions, and present ONE refined idea. The idea must be:
1. A clear MVP scope (buildable in days, not months)
2. Genuinely useful or interesting
3. Technically feasible as a web app
4. Differentiated from existing products

Output format:
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

    this.addEntry(this.maxTurns + 1, 'Moderator', response, 'synthesis');

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
  // Parse the synthesis into a structured IdeaArtifact
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
      `Synthesized from group chat debate (${this.transcript.length} turns). ` +
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

  // Expose the full transcript for debugging/inspection
  getDebateLog(): TranscriptEntry[] {
    return [...this.transcript];
  }

  getTranscript(): TranscriptEntry[] {
    return [...this.transcript];
  }
}
