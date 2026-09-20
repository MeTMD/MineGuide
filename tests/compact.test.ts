import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';

import {
  type MemoryMessage,
  buildTranscript,
  estimateMemoryTokens,
  estimateMessageTokens,
  estimateTokens,
  findProtectedTailStart,
  formatCompactPrompt,
  formatSummaryMessage,
  hasRemovableTurn,
  summarizeConversation,
} from '../src/chat/compact';

function systemMessage(content: string): MemoryMessage {
  return { role: 'system', content };
}

function userMessage(content: string): MemoryMessage {
  return { role: 'user', content };
}

function assistantMessage(content: string): MemoryMessage {
  return { role: 'assistant', content };
}

describe('estimateTokens', () => {
  it('counts wide characters as one token and ASCII as a quarter', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('中文')).toBe(2);
    expect(estimateTokens('a中')).toBe(2);
  });

  it('adds message overhead, tool calls and reasoning', () => {
    expect(estimateMessageTokens(userMessage('abcd'))).toBe(5);
    expect(
      estimateMessageTokens({
        role: 'assistant',
        content: '',
        reasoning_content: '想想',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'move_to', arguments: '{"x":1}' } },
        ],
      }),
    ).toBe(4 + 2 + 8 + estimateTokens('move_to{"x":1}'));
  });

  it('sums a memory array', () => {
    const memory = [systemMessage('系统'), userMessage('abcd')];
    expect(estimateMemoryTokens(memory)).toBe(6 + 5);
  });
});

describe('findProtectedTailStart', () => {
  const memory = [
    systemMessage('系统'),
    userMessage('甲'.repeat(10)),
    assistantMessage('乙'.repeat(10)),
    userMessage('丙'.repeat(10)),
    assistantMessage('丁'.repeat(10)),
  ];

  it('snaps the tail start to a user boundary', () => {
    expect(findProtectedTailStart(memory, 15)).toBe(3);
    expect(findProtectedTailStart(memory, 60)).toBe(1);
  });

  it('stops at the newest user turn when the budget is tiny', () => {
    expect(findProtectedTailStart(memory, 0)).toBe(3);
  });

  it('protects the whole history when the budget is out of reach', () => {
    expect(findProtectedTailStart(memory, 10_000)).toBe(1);
    expect(hasRemovableTurn(memory, 1)).toBe(false);
  });

  it('reports whether a removable user turn exists', () => {
    expect(hasRemovableTurn(memory, 3)).toBe(true);
    expect(hasRemovableTurn(memory, 1)).toBe(false);
    expect(hasRemovableTurn([systemMessage('s'), systemMessage('summary')], 1)).toBe(false);
  });
});

describe('buildTranscript', () => {
  it('renders roles, tool calls and results without reasoning', () => {
    const transcript = buildTranscript([
      systemMessage('导航事件：已抵达'),
      userMessage('带我去正门'),
      {
        role: 'assistant',
        content: '好的',
        reasoning_content: '不应出现',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'move_to', arguments: '{"x":1,"y":2,"z":3}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '已抵达' },
    ]);

    expect(transcript).toContain('[系统] 导航事件：已抵达');
    expect(transcript).toContain('[用户] 带我去正门');
    expect(transcript).toContain('[助手] 好的 调用工具 move_to({"x":1,"y":2,"z":3})');
    expect(transcript).toContain('[工具结果] 已抵达');
    expect(transcript).not.toContain('不应出现');
  });
});

describe('formatCompactPrompt', () => {
  it('includes requirements, previous summary and transcript', () => {
    const prompt = formatCompactPrompt('上次摘要', '记录正文');

    expect(prompt).toContain('1000 tokens');
    expect(prompt).toContain('用户身份与偏好');
    expect(prompt).toContain('已有摘要');
    expect(prompt).toContain('上次摘要');
    expect(prompt).toContain('记录正文');
  });

  it('omits the previous summary section when there is none', () => {
    expect(formatCompactPrompt('', '记录正文')).not.toContain('已有摘要');
  });
});

describe('summarizeConversation', () => {
  function clientReturning(response: unknown) {
    const calls: Array<Record<string, unknown>> = [];
    const create = (params: Record<string, unknown>) => {
      calls.push(params);
      return Promise.resolve(response);
    };
    return { client: { chat: { completions: { create } } } as unknown as OpenAI, calls };
  }

  it('sends a non-streaming request and returns the trimmed summary', async () => {
    const { client, calls } = clientReturning({
      choices: [{ message: { content: '  摘要正文  ' } }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 5,
        total_tokens: 25,
        prompt_cache_hit_tokens: 4,
        completion_tokens_details: { reasoning_tokens: 3 },
      },
    });

    const result = await summarizeConversation(
      client,
      { model: 'test-model', thinking: 'disabled', reasoningEffort: 'low' },
      '压缩提示',
    );

    expect(result.summary).toBe('摘要正文');
    expect(result.usage).toEqual({
      prompt: 20,
      completion: 5,
      reasoning: 3,
      cached: 4,
      cacheMiss: 16,
      total: 25,
    });
    expect(calls[0]).toMatchObject({
      model: 'test-model',
      stream: false,
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      reasoning_effort: 'low',
      messages: [{ role: 'user', content: '压缩提示' }],
    });
  });

  it('rejects an empty summary', async () => {
    const { client } = clientReturning({ choices: [{ message: { content: '   ' } }] });
    await expect(
      summarizeConversation(client, { model: 'm', thinking: 'enabled', reasoningEffort: 'high' }, 'p'),
    ).rejects.toThrow('empty summary');
  });
});

describe('formatSummaryMessage', () => {
  it('wraps the summary as a system memory with the compact prefix', () => {
    expect(formatSummaryMessage('摘要')).toEqual({
      role: 'system',
      content: '[上下文压缩摘要]\n摘要',
    });
  });
});
