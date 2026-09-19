import type OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Agent } from '../src/chat/agent';
import { parseConfig, type MineGuideConfig } from '../src/data';

const SCENE_JSON = JSON.stringify({
  meta: { name: '场景', location: '地点' },
  anchors: [{ name: '正门', alias: ['东门'], position: [1, 2, 3], description: '描述' }],
});

function makeConfig(historyRounds = 20): MineGuideConfig {
  const ini = [
    '[Connection]',
    'host = 127.0.0.1',
    'port = 25565',
    'username = Bot',
    '[Scene]',
    'data_file = scene.json',
    '[LLM]',
    'model_name = test-model',
    `history_rounds = ${historyRounds}`,
    '[LLMClient]',
    'apiKey = test-key',
  ].join('\n');
  return parseConfig(ini, SCENE_JSON);
}

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatCall {
  stream?: boolean;
  messages: ChatMessage[];
}

type StreamFactory = () => AsyncGenerator<unknown>;

function stringStream(chunks: string[]): StreamFactory {
  return async function* generate() {
    for (const content of chunks) {
      yield { choices: [{ delta: { content } }] };
    }
  };
}

function createFakeClient(factories: StreamFactory[], predefine = 'opening') {
  const calls: ChatCall[] = [];
  let index = 0;

  const create = (params: ChatCall): unknown => {
    calls.push(params);
    if (params.stream === true) {
      const factory = factories[index] ?? stringStream([]);
      index += 1;
      return factory();
    }
    return Promise.resolve({ choices: [{ message: { content: predefine } }] });
  };

  return { client: { chat: { completions: { create } } } as unknown as OpenAI, calls };
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

  it('stores the predefined reply in memory', async () => {
    const { client, calls } = createFakeClient([stringStream(['hi\n'])]);
    const agent = await Agent.create(makeConfig(), client);

    await collect(agent.chat('Alice', USER, SELF, 'hello'));

    const chatCall = calls.find((call) => call.stream === true);
    expect(chatCall?.messages[1]).toEqual({ role: 'assistant', content: 'opening' });
  });

  it('yields sentences split on newlines', async () => {
    const { client } = createFakeClient([stringStream(['你好\n', '世界\n'])]);
    const agent = await Agent.create(makeConfig(), client);

    expect(await collect(agent.chat('Alice', USER, SELF, 'hello'))).toEqual(['你好', '世界']);
  });

  it('does not yield empty sentences', async () => {
    const { client } = createFakeClient([stringStream(['abc\n'])]);
    const agent = await Agent.create(makeConfig(), client);

    expect(await collect(agent.chat('Alice', USER, SELF, 'hello'))).toEqual(['abc']);
  });

  it('stores the assistant reply without think content', async () => {
    const { client, calls } = createFakeClient([
      stringStream(['<thi', 'nk>隐藏</thi', 'nk>回答\n']),
      stringStream(['ok\n']),
    ]);
    const agent = await Agent.create(makeConfig(), client);

    expect(await collect(agent.chat('Alice', USER, SELF, 'hello'))).toEqual(['回答']);
    await collect(agent.chat('Alice', USER, SELF, 'again'));

    const streamCalls = calls.filter((call) => call.stream === true);
    const assistants = (streamCalls[1]?.messages ?? []).filter((message) => message.role === 'assistant');
    expect(assistants.at(-1)).toEqual({ role: 'assistant', content: '回答' });
  });

  it('sends only the configured number of recent rounds', async () => {
    const { client, calls } = createFakeClient([stringStream(['r1\n']), stringStream(['r2\n'])]);
    const agent = await Agent.create(makeConfig(1), client);

    await collect(agent.chat('Alice', USER, SELF, 'first'));
    await collect(agent.chat('Alice', USER, SELF, 'second'));

    const streamCalls = calls.filter((call) => call.stream === true);
    const second = streamCalls[1]?.messages ?? [];
    expect(second.map((message) => message.content)).toEqual([
      expect.stringContaining('你是一个在 Minecraft 里的智能导游'),
      'opening',
      'r1',
      expect.stringContaining('second'),
    ]);
  });

  it('keeps the full history when history_rounds is 0', async () => {
    const { client, calls } = createFakeClient([stringStream(['r1\n']), stringStream(['r2\n'])]);
    const agent = await Agent.create(makeConfig(0), client);

    await collect(agent.chat('Alice', USER, SELF, 'first'));
    await collect(agent.chat('Alice', USER, SELF, 'second'));

    const streamCalls = calls.filter((call) => call.stream === true);
    expect(streamCalls[1]?.messages).toHaveLength(5);
  });

  it('logs stream errors but keeps partial memory', async () => {
    const failing: StreamFactory = async function* generate() {
      yield { choices: [{ delta: { content: '部分' } }] };
      throw new Error('boom');
    };
    const { client, calls } = createFakeClient([failing, stringStream(['ok\n'])]);
    const agent = await Agent.create(makeConfig(), client);

    expect(await collect(agent.chat('Alice', USER, SELF, 'hello'))).toEqual([]);
    await collect(agent.chat('Alice', USER, SELF, 'again'));

    const streamCalls = calls.filter((call) => call.stream === true);
    const assistants = (streamCalls[1]?.messages ?? []).filter((message) => message.role === 'assistant');
    expect(assistants.at(-1)).toEqual({ role: 'assistant', content: '部分' });
  });
});
