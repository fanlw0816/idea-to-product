import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

export interface AgentConfig {
  name: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt: string;
  apiKey?: string;
  baseUrl?: string;
}

export abstract class BaseAgent {
  protected client: Anthropic;
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
    };
    // Custom base URL (for proxies, compatible APIs, etc.)
    if (config.baseUrl) {
      clientOptions.baseURL = config.baseUrl;
    }
    this.client = new Anthropic(clientOptions);
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

  // Streaming variant — yields text chunks as they arrive
  protected async *streamChat(messages: MessageParam[], maxTokens?: number): AsyncIterable<string> {
    const stream = await this.client.messages.create({
      model: this.config.model || 'claude-sonnet-4-6-20250514',
      max_tokens: maxTokens || this.config.maxTokens || 8192,
      temperature: this.config.temperature ?? 0.7,
      system: this.config.systemPrompt,
      messages,
      stream: true,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }

  // Abstract method that each agent implements
  abstract run(input: any): Promise<any>;

  protected get name(): string {
    return this.config.name;
  }
}
