import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

import type { LlmReasoningEffort, LlmThinking, MineGuideConfig } from '../data';
import type { TokenUsage, ToolCallRecord } from '../debug/events';
import { type RequestSpan, type RequestTiming, type Tracer, type TurnSpan, nullTracer } from '../debug/tracer';
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

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
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

interface StreamResult {
  turn: AssistantTurn;
  span: RequestSpan;
  timing: RequestTiming;
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

function toTokenUsage(raw: RawUsage | null | undefined): TokenUsage | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const prompt = raw.prompt_tokens ?? 0;
  const completion = raw.completion_tokens ?? 0;
  const cached = raw.prompt_cache_hit_tokens ?? raw.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    prompt,
    completion,
    reasoning: raw.completion_tokens_details?.reasoning_tokens ?? 0,
    cached,
    cacheMiss: Math.max(prompt - cached, 0),
    total: raw.total_tokens ?? prompt + completion,
  };
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatUsage(usage: TokenUsage | undefined): string {
  if (usage === undefined) {
    return 'usage unknown';
  }
  return `${usage.completion} tok (r${usage.reasoning}/c${usage.completion - usage.reasoning})`;
}

export class Agent {
  private readonly client: OpenAI;
  private readonly config: MineGuideConfig;
  private readonly runtime: ToolRuntime;
  private readonly tracer: Tracer;
  private readonly memory: MemoryMessage[];

  constructor(config: MineGuideConfig, runtime: ToolRuntime, client?: OpenAI, tracer: Tracer = nullTracer) {
    this.client = client ?? new OpenAI(config.llmClient);
    this.config = config;
    this.runtime = runtime;
    this.tracer = tracer;
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
    const content = formatAgentChat({
      username,
      userPosition: formatPosition(userPosition),
      selfPosition: formatPosition(selfPosition),
      message,
    });

    const span = this.tracer.beginTurn('chat', content);
    this.memory.push({ role: 'user', content });
    try {
      yield* this.runTurn(span);
    } finally {
      span.end();
    }
  }

  async *announce(event: string): AsyncGenerator<string> {
    const span = this.tracer.beginTurn('announce', event);
    this.memory.push({ role: 'system', content: event });
    try {
      yield* this.runTurn(span);
    } finally {
      span.end();
    }
  }

  private async *runTurn(span: TurnSpan): AsyncGenerator<string> {
    const maxSubturns = this.config.llmMaxToolSubturns;
    for (let subturn = 1; subturn <= maxSubturns; subturn += 1) {
      const result = yield* this.generateStream(span);
      if (result.turn.toolCalls.length === 0) {
        return;
      }
      for (const call of result.turn.toolCalls) {
        const text = await this.executeToolCall(call, result.span);
        this.memory.push({ role: 'tool', tool_call_id: call.id, content: text });
      }
    }

    const message = `Exceeded max_tool_subturns (${maxSubturns}), aborted the turn`;
    logger.error(message);
    this.tracer.error('agent', message);
  }

  private async *generateStream(span: TurnSpan): AsyncGenerator<string, StreamResult> {
    const messages = [...this.memory];
    const params: DeepSeekChatParams = {
      model: this.config.llmModelName,
      messages,
      stream: true,
      tools: TOOLS,
      thinking: { type: this.config.llmThinking },
      reasoning_effort: this.config.llmReasoningEffort,
    };

    const request = span.newRequest(
      this.config.llmModelName,
      this.config.llmThinking,
      this.config.llmReasoningEffort,
      messages,
    );

    const partials = new Map<number, PartialToolCall>();
    let content = '';
    let reasoning = '';
    let lineBuffer = '';
    let finishReason: string | null = null;
    let usage: TokenUsage | undefined;
    let failure: string | undefined;

    try {
      logger.debug('Fetching LLM response', {
        turn: request.turn,
        step: request.step,
        requestId: request.requestId,
      });
      const stream = await this.client.chat.completions.create(params);
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as DeepSeekDelta | undefined;
        const chunkFinish = chunk.choices[0]?.finish_reason;
        if (chunkFinish) {
          finishReason = chunkFinish;
        }
        usage = toTokenUsage(chunk.usage as unknown as RawUsage | null | undefined) ?? usage;
        if (delta === undefined) {
          continue;
        }

        const now = Date.now();
        if (delta.reasoning_content) {
          request.noteToken('reasoning', now);
          reasoning += delta.reasoning_content;
        }

        if (delta.tool_calls && delta.tool_calls.length > 0) {
          request.noteToken('tool_call', now);
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
          request.noteToken('content', now);
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
      failure = error instanceof Error ? error.message : String(error);
      logger.error(`LLM API Error ${failure}`, {
        turn: request.turn,
        step: request.step,
        requestId: request.requestId,
      });
    }

    const tail = lineBuffer.trim();
    if (tail) {
      yield tail;
    }

    const toolCalls: PartialToolCall[] =
      failure !== undefined
        ? []
        : [...partials.values()]
            .filter((call) => call.name !== '')
            .map((call) => ({ ...call, id: call.id === '' ? `call_${call.index}` : call.id }));

    const toolCallRecords: ToolCallRecord[] = toolCalls.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));

    if (content !== '' || reasoning !== '' || toolCalls.length > 0) {
      this.memory.push(
        buildAssistantMessage(content, reasoning, toolCalls, this.config.llmThinking === 'enabled'),
      );
    }

    const timing = request.finish({
      status: failure === undefined ? 'completed' : 'error',
      finishReason,
      error: failure,
      content,
      reasoning,
      toolCalls: toolCallRecords,
      usage,
    });

    const toolSuffix = toolCallRecords.length > 0 ? `, ${toolCallRecords.length} tool` : '';
    logger.debug(
      `Step ${request.turn}.${request.step} ${failure === undefined ? 'completed' : 'error'}, ` +
        `${formatSeconds(timing.durationMs)}, TTFT ${formatSeconds(timing.ttftMs)}, ` +
        `${formatUsage(usage)}${toolSuffix}`,
      { turn: request.turn, step: request.step, requestId: request.requestId },
    );

    return { turn: { content, reasoning, toolCalls }, span: request, timing };
  }

  private async executeToolCall(call: PartialToolCall, request: RequestSpan): Promise<string> {
    const context = { turn: request.turn, step: request.step, requestId: request.requestId };
    request.toolStart(call.id, call.name, call.arguments, Date.now());
    logger.info(`Tool call ${call.name} ${call.arguments}`, context);

    const settle = (text: string, status: 'completed' | 'error'): string => {
      request.toolEnd(call.id, status, text, Date.now());
      return text;
    };

    if (call.name !== MOVE_TO_TOOL_NAME) {
      return settle(`错误：未知工具 ${call.name}`, 'error');
    }

    let args: unknown;
    try {
      args = JSON.parse(call.arguments === '' ? '{}' : call.arguments);
    } catch {
      return settle('错误：参数不是合法的 JSON', 'error');
    }

    const parsed = moveToSchema.safeParse(args);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => issue.message).join('; ');
      return settle(`错误：参数不合法（${details}）`, 'error');
    }

    try {
      const result = await this.runtime.moveTo(parsed.data.x, parsed.data.y, parsed.data.z);
      return settle(result, 'completed');
    } catch (error) {
      return settle(`错误：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }
}
