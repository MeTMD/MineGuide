import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

import type { LlmReasoningEffort, LlmThinking, MineGuideConfig } from '../data';
import { createLogger } from '../logger';
import { formatPosition, type Position } from '../vector';
import { formatAgentChat, formatAgentInit, formatAnchors } from './prompts';
import { MOVE_TO_TOOL_NAME, TOOLS, moveToSchema } from './tools';

const logger = createLogger('Agent');

export interface ToolRuntime {
  moveTo(x: number, y: number, z: number): Promise<string>;
}

interface DeepSeekChatParams extends ChatCompletionCreateParamsStreaming {
  thinking: { type: LlmThinking };
  reasoning_effort: LlmReasoningEffort;
}

interface DeepSeekDelta {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface PartialToolCall {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

type MemoryMessage = ChatCompletionMessageParam & { reasoning_content?: string };

interface AssistantTurn {
  content: string;
  reasoning: string;
  toolCalls: PartialToolCall[];
}

function buildAssistantMessage(
  content: string,
  reasoning: string,
  toolCalls: PartialToolCall[],
  includeReasoning: boolean,
): MemoryMessage {
  const message: MemoryMessage = { role: 'assistant', content };
  if (includeReasoning) {
    message.reasoning_content = reasoning;
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls.map(
      (call): ChatCompletionMessageToolCall => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      }),
    );
  }
  return message;
}

export class Agent {
  private readonly client: OpenAI;
  private readonly config: MineGuideConfig;
  private readonly runtime: ToolRuntime;
  private readonly memory: MemoryMessage[];

  constructor(config: MineGuideConfig, runtime: ToolRuntime, client?: OpenAI) {
    this.client = client ?? new OpenAI(config.llmClient);
    this.config = config;
    this.runtime = runtime;
    this.memory = [
      {
        role: 'system',
        content: formatAgentInit(
          config.scene.meta.name,
          config.scene.meta.location,
          formatAnchors(config.scene.anchors),
        ),
      },
    ];
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

    yield* this.runTurn();
  }

  async *announce(event: string): AsyncGenerator<string> {
    this.memory.push({ role: 'system', content: event });
    yield* this.runTurn();
  }

  private async *runTurn(): AsyncGenerator<string> {
    const maxSubturns = this.config.llmMaxToolSubturns;
    for (let subturn = 1; subturn <= maxSubturns; subturn += 1) {
      const turn = yield* this.generateStream();
      if (turn.toolCalls.length === 0) {
        return;
      }
      for (const call of turn.toolCalls) {
        const result = await this.executeToolCall(call);
        this.memory.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    logger.error(`Exceeded max_tool_subturns (${maxSubturns}), aborted the turn`);
  }

  private async *generateStream(): AsyncGenerator<string, AssistantTurn> {
    const params: DeepSeekChatParams = {
      model: this.config.llmModelName,
      messages: [...this.memory],
      stream: true,
      tools: TOOLS,
      thinking: { type: this.config.llmThinking },
      reasoning_effort: this.config.llmReasoningEffort,
    };

    const partials = new Map<number, PartialToolCall>();
    let content = '';
    let reasoning = '';
    let lineBuffer = '';
    let failed = false;

    try {
      logger.debug('Fetching LLM response');
      const stream = await this.client.chat.completions.create(params);
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as DeepSeekDelta | undefined;
        if (delta === undefined) {
          continue;
        }

        if (delta.reasoning_content) {
          reasoning += delta.reasoning_content;
        }

        for (const fragment of delta.tool_calls ?? []) {
          const call = partials.get(fragment.index) ?? {
            index: fragment.index,
            id: '',
            name: '',
            arguments: '',
          };
          if (fragment.id) {
            call.id = fragment.id;
          }
          if (fragment.function?.name) {
            call.name = fragment.function.name;
          }
          if (fragment.function?.arguments) {
            call.arguments += fragment.function.arguments;
          }
          partials.set(fragment.index, call);
        }

        if (delta.content) {
          content += delta.content;
          lineBuffer += delta.content;
          if (lineBuffer.includes('\n')) {
            const parts = lineBuffer.split('\n');
            while (parts.length > 1) {
              const sentence = (parts.shift() ?? '').trim();
              if (sentence) {
                yield sentence;
              }
            }
            lineBuffer = parts[0] ?? '';
          }
        }
      }
    } catch (error) {
      failed = true;
      logger.error(`LLM API Error ${error instanceof Error ? error.message : error}`);
    }

    const tail = lineBuffer.trim();
    if (tail) {
      yield tail;
    }

    const toolCalls = failed
      ? []
      : [...partials.values()]
          .filter((call) => call.name !== '')
          .map((call) => ({ ...call, id: call.id === '' ? `call_${call.index}` : call.id }));

    if (content !== '' || reasoning !== '' || toolCalls.length > 0) {
      this.memory.push(
        buildAssistantMessage(content, reasoning, toolCalls, this.config.llmThinking === 'enabled'),
      );
    }

    logger.debug(
      `LLM response done, content=${content.length} reasoning=${reasoning.length} toolCalls=${toolCalls.length}`,
    );

    return { content, reasoning, toolCalls };
  }

  private async executeToolCall(call: PartialToolCall): Promise<string> {
    logger.info(`Tool call ${call.name} ${call.arguments}`);
    if (call.name !== MOVE_TO_TOOL_NAME) {
      return `错误：未知工具 ${call.name}`;
    }

    let args: unknown;
    try {
      args = JSON.parse(call.arguments === '' ? '{}' : call.arguments);
    } catch {
      return '错误：参数不是合法的 JSON';
    }

    const parsed = moveToSchema.safeParse(args);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => issue.message).join('; ');
      return `错误：参数不合法（${details}）`;
    }

    try {
      return await this.runtime.moveTo(parsed.data.x, parsed.data.y, parsed.data.z);
    } catch (error) {
      return `错误：${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
