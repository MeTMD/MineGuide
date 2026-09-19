import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Agent, type ToolRuntime } from '../src/chat/agent';
import { parseConfig, type MineGuideConfig } from '../src/data';
import { DebugEventHub } from '../src/debug/events';
import { DebugTracer } from '../src/debug/tracer';

const SCENE_JSON = JSON.stringify({
  meta: { name: '场景', location: '地点' },
  anchors: [{ name: '正门', alias: ['东门'], position: [1, 2, 3], description: '描述' }],
});

function makeConfig(llm: string[] = []): MineGuideConfig {
  const ini = [
    '[Connection]',
    'host = 127.0.0.1',
    'port = 25565',
    'username = Bot',
    '[Scene]',
    'data_file = scene.json',
    '[LLM]',
    'model_name = test-model',
    ...llm,
    '[LLMClient]',
    'apiKey = test-key',
  ].join('\n');
  return parseConfig(ini, SCENE_JSON);
}

interface MemoryLike {
  role: string;
  content?: unknown;
  reasoning_content?: unknown;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface FakeParams {
  messages: MemoryLike[];
  tools?: Array<{ function: { name: string } }>;
  thinking?: { type: string };
  reasoning_effort?: string;
}

type StreamFactory = () => AsyncGenerator<unknown>;

function contentStream(chunks: string[]): StreamFactory {
  return async function* generate() {
    for (const content of chunks) {
      yield { choices: [{ delta: { content } }] };
    }
  };
}

function toolCallStream(id: string, name: string, argumentChunks: string[]): StreamFactory {
  return async function* generate() {
    yield { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: '' } }] } }] };
    for (const chunk of argumentChunks) {
      yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: chunk } }] } }] };
    }
  };
}

function createFakeClient(factories: StreamFactory[]) {
  const calls: FakeParams[] = [];
  let index = 0;
  const create = (params: FakeParams) => {
    calls.push(params);
    const factory = factories[index] ?? contentStream([]);
    index += 1;
    return factory();
  };
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, calls };
}

function createRuntime(result = '已出发') {
  const calls: Array<[number, number, number]> = [];
  const runtime: ToolRuntime = {
    async moveTo(x, y, z) {
      calls.push([x, y, z]);
      return result;
    },
  };
  return { runtime, calls };
}

async function collect(generator: AsyncGenerator<string>): Promise<string[]> {
  const result: string[] = [];
  for await (const sentence of generator) {
    result.push(sentence);
  }
  return result;
}

const SELF = { x: 4, y: 5, z: 6 };
const USER = { x: 1, y: 2, z: 3 };

describe('Agent', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the memory with a system prompt and sends tool options', async () => {
    const { client, calls } = createFakeClient([contentStream(['你好\n'])]);
    const { runtime } = createRuntime();

    const agent = new Agent(makeConfig(), runtime, client);
    await collect(agent.chat('Alice', USER, SELF, 'hello'));

    const call = calls[0];
    expect(call?.messages[0]).toMatchObject({ role: 'system' });
    expect(String(call?.messages[0]?.content)).toContain('智能导游');
    expect(call?.tools?.[0]?.function.name).toBe('move_to');
    expect(call?.thinking).toEqual({ type: 'enabled' });
    expect(call?.reasoning_effort).toBe('high');
  });

  it('yields sentences split on newlines', async () => {
    const { client } = createFakeClient([contentStream(['你好\n', '世界\n'])]);
    const { runtime } = createRuntime();

    const agent = new Agent(makeConfig(), runtime, client);
    expect(await collect(agent.chat('Alice', USER, SELF, 'hello'))).toEqual(['你好', '世界']);
  });

  it('executes tool calls and continues the loop', async () => {
    const { client, calls } = createFakeClient([
      toolCallStream('call_1', 'move_to', ['{"x":1,', '"y":2,"z":3}']),
      contentStream(['好的\n']),
    ]);
    const { runtime, calls: moves } = createRuntime('已出发前往 (1, 2, 3)');

    const agent = new Agent(makeConfig(), runtime, client);
    expect(await collect(agent.chat('Alice', USER, SELF, 'go'))).toEqual(['好的']);
    expect(moves).toEqual([[1, 2, 3]]);

    const second = calls[1]?.messages ?? [];
    const assistant = second.find((message) => message.role === 'assistant' && message.tool_calls);
    expect(assistant?.tool_calls?.[0]?.function).toEqual({ name: 'move_to', arguments: '{"x":1,"y":2,"z":3}' });
    expect(second.find((message) => message.role === 'tool')?.tool_call_id).toBe('call_1');
  });

  it('stores reasoning_content for later requests', async () => {
    const thinking: StreamFactory = async function* generate() {
      yield { choices: [{ delta: { reasoning_content: '先想' } }] };
      yield { choices: [{ delta: { content: '回答\n' } }] };
    };
    const { client, calls } = createFakeClient([thinking, contentStream(['再次\n'])]);

    const agent = new Agent(makeConfig(), createRuntime().runtime, client);
    await collect(agent.chat('Alice', USER, SELF, 'first'));
    await collect(agent.chat('Alice', USER, SELF, 'second'));

    const second = calls[1]?.messages ?? [];
    expect(second.find((message) => message.role === 'assistant')?.reasoning_content).toBe('先想');
  });

  it('keeps an empty reasoning_content on assistant messages when thinking is enabled', async () => {
    const { client, calls } = createFakeClient([contentStream(['回答\n']), contentStream(['再次\n'])]);

    const agent = new Agent(makeConfig(), createRuntime().runtime, client);
    await collect(agent.chat('Alice', USER, SELF, 'first'));
    await collect(agent.chat('Alice', USER, SELF, 'second'));

    const assistant = (calls[1]?.messages ?? []).find((message) => message.role === 'assistant');
    expect(assistant?.reasoning_content).toBe('');
  });

  it('omits reasoning_content when thinking is disabled', async () => {
    const { client, calls } = createFakeClient([contentStream(['回答\n']), contentStream(['再次\n'])]);

    const agent = new Agent(makeConfig(['thinking = disabled']), createRuntime().runtime, client);
    await collect(agent.chat('Alice', USER, SELF, 'first'));
    await collect(agent.chat('Alice', USER, SELF, 'second'));

    const assistant = (calls[1]?.messages ?? []).find((message) => message.role === 'assistant');
    expect(assistant).not.toHaveProperty('reasoning_content');
  });

  it('keeps the whole history across turns', async () => {
    const { client, calls } = createFakeClient([contentStream(['r1\n']), contentStream(['r2\n'])]);

    const agent = new Agent(makeConfig(), createRuntime().runtime, client);
    await collect(agent.chat('Alice', USER, SELF, 'first'));
    await collect(agent.chat('Alice', USER, SELF, 'second'));

    const second = calls[1]?.messages ?? [];
    expect(second.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(String(second.at(-1)?.content)).toContain('second');
  });

  it('aborts after max_tool_subturns', async () => {
    const factories = Array.from({ length: 3 }, (_, index) =>
      toolCallStream(`call_${index}`, 'move_to', ['{"x":1,"y":2,"z":3}']),
    );
    const { client } = createFakeClient(factories);
    const { runtime, calls: moves } = createRuntime();

    const agent = new Agent(makeConfig(['max_tool_subturns = 2']), runtime, client);
    expect(await collect(agent.chat('Alice', USER, SELF, 'go'))).toEqual([]);
    expect(moves).toHaveLength(2);
  });

  it('feeds invalid tool arguments back as errors', async () => {
    const { client, calls } = createFakeClient([
      toolCallStream('call_1', 'move_to', ['not-json']),
      contentStream(['抱歉\n']),
    ]);
    const { runtime, calls: moves } = createRuntime();

    const agent = new Agent(makeConfig(), runtime, client);
    expect(await collect(agent.chat('Alice', USER, SELF, 'go'))).toEqual(['抱歉']);
    expect(moves).toHaveLength(0);

    const toolMessage = (calls[1]?.messages ?? []).find((message) => message.role === 'tool');
    expect(String(toolMessage?.content)).toContain('错误');
  });

  it('stays silent when the model outputs nothing', async () => {
    const { client, calls } = createFakeClient([contentStream([]), contentStream([])]);

    const agent = new Agent(makeConfig(), createRuntime().runtime, client);
    expect(await collect(agent.chat('Alice', USER, SELF, 'hello'))).toEqual([]);
    await collect(agent.chat('Alice', USER, SELF, 'again'));

    const assistants = (calls[1]?.messages ?? []).filter((message) => message.role === 'assistant');
    expect(assistants).toHaveLength(0);
  });

  it('logs stream errors but keeps partial memory', async () => {
    const failing: StreamFactory = async function* generate() {
      yield { choices: [{ delta: { content: '部分' } }] };
      throw new Error('boom');
    };
    const { client, calls } = createFakeClient([failing, contentStream(['ok\n'])]);

    const agent = new Agent(makeConfig(), createRuntime().runtime, client);
    expect(await collect(agent.chat('Alice', USER, SELF, 'hello'))).toEqual(['部分']);
    await collect(agent.chat('Alice', USER, SELF, 'again'));

    const assistants = (calls[1]?.messages ?? []).filter((message) => message.role === 'assistant');
    expect(assistants.at(-1)?.content).toBe('部分');
  });

  it('records pipeline events and token usage through the tracer', async () => {
    const finalStream: StreamFactory = async function* generate() {
      yield { choices: [{ delta: { content: '好的\n' } }] };
      yield {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          prompt_cache_hit_tokens: 4,
          completion_tokens_details: { reasoning_tokens: 2 },
        },
      };
    };
    const { client } = createFakeClient([
      toolCallStream('call_1', 'move_to', ['{"x":1,"y":2,"z":3}']),
      finalStream,
    ]);
    const hub = new DebugEventHub();
    const agent = new Agent(makeConfig(), createRuntime().runtime, client, new DebugTracer(hub));

    await collect(agent.chat('Alice', USER, SELF, 'go'));

    const records = hub.pipelineRecords();
    const turns = records.filter((record) => record.kind === 'turn_start');
    expect(turns).toHaveLength(1);
    expect(turns[0]?.kind === 'turn_start' ? turns[0].source : '').toBe('chat');
    expect(records.filter((record) => record.kind === 'turn_end')).toHaveLength(1);
    expect(records.some((record) => record.kind === 'request_first_token')).toBe(true);

    const ends = records.filter((record) => record.kind === 'request_end');
    expect(ends).toHaveLength(2);
    const last = ends[1];
    expect(last?.kind === 'request_end' ? last.usage : undefined).toEqual({
      prompt: 10,
      completion: 5,
      reasoning: 2,
      cached: 4,
      cacheMiss: 6,
      total: 15,
    });

    const toolEnd = records.find((record) => record.kind === 'tool_end');
    expect(toolEnd?.kind === 'tool_end' ? toolEnd.status : '').toBe('completed');
  });

  it('announces navigation events through the same loop', async () => {
    const { client, calls } = createFakeClient([contentStream(['到了\n'])]);

    const agent = new Agent(makeConfig(), createRuntime().runtime, client);
    expect(await collect(agent.announce('导航事件：已抵达目标 (1.0, 2.0, 3.0)'))).toEqual(['到了']);
    expect(calls[0]?.messages.at(-1)).toEqual({
      role: 'system',
      content: '导航事件：已抵达目标 (1.0, 2.0, 3.0)',
    });
  });
});
