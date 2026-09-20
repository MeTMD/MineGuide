import type OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import type { LlmReasoningEffort, LlmThinking } from '../data';
import type { TokenUsage } from '../debug/events';
import { type RawUsage, toTokenUsage } from './usage';

export type MemoryMessage = ChatCompletionMessageParam & { reasoning_content?: string };

export const COMPACT_SUMMARY_PREFIX = '[上下文压缩摘要]';
export const TAIL_BUDGET_RATIO = 0.3;
export const SUMMARY_MAX_TOKENS = 2000;
const FIRST_MUTABLE_INDEX = 1;

interface DeepSeekSummaryParams extends ChatCompletionCreateParamsNonStreaming {
  thinking: { type: LlmThinking };
  reasoning_effort: LlmReasoningEffort;
}

export interface ContextBaseline {
  promptTokens: number;
  memoryLength: number;
}

export interface SummarizeOptions {
  model: string;
  thinking: LlmThinking;
  reasoningEffort: LlmReasoningEffort;
}

export interface CompactSummaryResult {
  summary: string;
  usage?: TokenUsage;
}

export function estimateTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const char of text) {
    if (char.codePointAt(0)! > 0x7f) {
      wide += 1;
    } else {
      ascii += 1;
    }
  }
  return wide + Math.ceil(ascii / 4);
}

export function estimateMessageTokens(message: MemoryMessage): number {
  let total = 4;
  if (typeof message.content === 'string') {
    total += estimateTokens(message.content);
  }
  if (message.role === 'assistant') {
    for (const call of message.tool_calls ?? []) {
      if (call.type !== 'function') {
        continue;
      }
      total += estimateTokens(`${call.function.name}${call.function.arguments}`) + 8;
    }
  }
  if (message.reasoning_content !== undefined) {
    total += estimateTokens(message.reasoning_content);
  }
  return total;
}

export function estimateMemoryTokens(memory: MemoryMessage[]): number {
  return memory.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

export function findProtectedTailStart(memory: MemoryMessage[], budgetTokens: number): number {
  let total = 0;
  let start = memory.length;
  for (let index = memory.length - 1; index > 0; index -= 1) {
    total += estimateMessageTokens(memory[index]!);
    start = index;
    if (total >= budgetTokens && memory[index]!.role === 'user') {
      break;
    }
  }
  return start;
}

export function hasRemovableTurn(memory: MemoryMessage[], tailStart: number): boolean {
  return memory.slice(FIRST_MUTABLE_INDEX, tailStart).some((message) => message.role === 'user');
}

export function buildTranscript(messages: MemoryMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      lines.push(`[工具结果] ${contentText(message.content)}`);
    } else if (message.role === 'assistant') {
      const parts: string[] = [];
      if (message.content !== undefined && message.content !== null && message.content !== '') {
        parts.push(contentText(message.content));
      }
      for (const call of message.tool_calls ?? []) {
        if (call.type !== 'function') {
          continue;
        }
        parts.push(`调用工具 ${call.function.name}(${call.function.arguments})`);
      }
      if (parts.length > 0) {
        lines.push(`[助手] ${parts.join(' ')}`);
      }
    } else if (message.role === 'user') {
      lines.push(`[用户] ${contentText(message.content)}`);
    } else {
      lines.push(`[系统] ${contentText(message.content)}`);
    }
  }
  return lines.join('\n');
}

export function formatCompactPrompt(previousSummary: string, transcript: string): string {
  const previous = previousSummary
    ? `## 已有摘要（需与新对话合并，可修正其中过时的内容）\n${previousSummary}\n\n`
    : '';
  return `请把以下 Minecraft 导游机器人的多轮对话压缩成一段简洁的中文摘要，供后续对话直接参考。

要求：
1. 总长度不超过 1000 tokens，条目化书写。
2. 必须覆盖：用户身份与偏好；已达成或承诺的事项；导航与位置状态（当前目标、已完成或失败的移动）；未决事项；其他影响后续对话的关键事实。
3. 只使用对话中真实出现过的信息，不得编造。
4. 按下面的格式输出，没有内容的条目可以省略，不要输出标题、前言或解释：

用户身份与偏好：...
约定与承诺：...
导航与位置状态：...
未决事项：...
其他关键事实：...

${previous}## 待压缩的对话记录
${transcript}`;
}

export async function summarizeConversation(
  client: OpenAI,
  options: SummarizeOptions,
  prompt: string,
): Promise<CompactSummaryResult> {
  const params: DeepSeekSummaryParams = {
    model: options.model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    thinking: { type: options.thinking },
    reasoning_effort: options.reasoningEffort,
    max_tokens: SUMMARY_MAX_TOKENS,
  };
  const response = await client.chat.completions.create(params);
  const message = response.choices[0]?.message;
  const summary = typeof message?.content === 'string' ? message.content.trim() : '';
  if (summary === '') {
    throw new Error('empty summary');
  }
  return {
    summary,
    usage: toTokenUsage(response.usage as unknown as RawUsage | null | undefined),
  };
}

export function formatSummaryMessage(summary: string): MemoryMessage {
  return { role: 'system', content: `${COMPACT_SUMMARY_PREFIX}\n${summary}` };
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}
