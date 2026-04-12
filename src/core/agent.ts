import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages.mjs';

export interface AgentConfig {
  name: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt: string;
  apiKey?: string;
}

export abstract class BaseAgent {
  protected client: Anthropic;
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
    });
  }

  // Core method: send a message and get a response
  protected async chat(messages: MessageParam[], maxTokens?: number): Promise<string> {
    const response = await this.client.messages.create({
      model: this.config.model || 'claude-sonnet-4-6-20250514',
      max_tokens: maxTokens || this.config.maxTokens || 8192,
      temperature: this.config.temperature ?? 0.7,
      system: this.config.systemPrompt,
      messages,
    });
    // Extract text content from response
    const textContent = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('\n');
    return textContent;
  }

  // Abstract method that each agent implements
  abstract run(input: any): Promise<any>;

  protected get name(): string {
    return this.config.name;
  }
}
