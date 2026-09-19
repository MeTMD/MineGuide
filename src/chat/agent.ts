import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type { MineGuideConfig } from '../data';
import { createLogger } from '../logger';
import { formatPosition, type Position } from '../vector';
import { formatAgentChat, formatAgentInit, formatAnchors } from './prompts';
import { ThinkStripper } from './think';

const logger = createLogger('Agent');

function purify(text: string): string {
  return text.trim().replaceAll('<think>', '').replaceAll('</think>', '');
}

export class Agent {
  private readonly client: OpenAI;
  private readonly config: MineGuideConfig;
  private readonly memory: ChatCompletionMessageParam[];

  private constructor(client: OpenAI, config: MineGuideConfig, memory: ChatCompletionMessageParam[]) {
    this.client = client;
    this.config = config;
    this.memory = memory;
  }

  static async create(config: MineGuideConfig, client?: OpenAI): Promise<Agent> {
    const openai = client ?? new OpenAI(config.llmClient);
    const memory: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: formatAgentInit(
          config.scene.meta.name,
          config.scene.meta.location,
          formatAnchors(config.scene.anchors),
        ),
      },
    ];

    const predefine = await openai.chat.completions.create({
      messages: memory,
      model: config.llmModelName,
      stream: false,
    });
    memory.push({ role: 'assistant', content: predefine.choices[0]?.message?.content ?? '' });

    return new Agent(openai, config, memory);
  }

  async *chat(
    username: string,
    userPosition: Position,
    selfPosition: Position,
    message: string,
  ): AsyncGenerator<string> {
    this.memory.push({
      role: 'user',
      content: formatAgentChat({
        username,
        userPosition: formatPosition(userPosition),
        selfPosition: formatPosition(selfPosition),
        message,
      }),
    });

    const stream = await this.client.chat.completions.create({
      messages: this.buildMessages(),
      model: this.config.llmModelName,
      stream: true,
    });

    const stripper = new ThinkStripper();
    let rest = '';
    let full = '';

    try {
      logger.debug('Fetching LLM response');
      for await (const chunk of stream) {
        const visible = stripper.push(chunk.choices[0]?.delta?.content ?? '');
        rest += visible;
        full += visible;

        if (rest.includes('\n')) {
          const parts = rest.split('\n');
          while (parts.length > 1) {
            const sentence = purify(parts.shift() ?? '');
            if (sentence) {
              yield sentence;
            }
          }
          rest = parts[0] ?? '';
        }
      }

      const tail = stripper.flush();
      rest += tail;
      full += tail;

      if (rest.includes('\n')) {
        const parts = rest.split('\n');
        while (parts.length > 1) {
          const sentence = purify(parts.shift() ?? '');
          if (sentence) {
            yield sentence;
          }
        }
        rest = parts[0] ?? '';
      }

      const last = purify(rest);
      if (last) {
        yield last;
      }
    } catch (error) {
      logger.error(`LLM API Error ${error instanceof Error ? error.message : error}`);
    } finally {
      this.memory.push({ role: 'assistant', content: full.trim() });
    }
  }

  private buildMessages(): ChatCompletionMessageParam[] {
    const rounds = this.config.llmHistoryRounds;
    if (rounds === 0) {
      return [...this.memory];
    }

    const head = this.memory.slice(0, 2);
    const history = this.memory.slice(2);
    const keep = rounds * 2;
    return [...head, ...(history.length > keep ? history.slice(history.length - keep) : history)];
  }
}
