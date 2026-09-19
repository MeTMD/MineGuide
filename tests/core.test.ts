import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuideBot } from '../src/api/bot';
import { handleMsg, type ChatAgent } from '../src/core';
import type { Position } from '../src/vector';

function position(x: number, y: number, z: number): Position {
  return { x, y, z };
}

function createAgent(sentences: string[]): ChatAgent {
  return {
    async *chat() {
      for (const sentence of sentences) {
        yield sentence;
      }
    },
    async *announce() {},
  };
}

interface BotOptions {
  playerPosition?: Position | null;
  selfPosition?: Position | null;
  block?: string | null;
}

function createBot(options: BotOptions = {}) {
  const playerPosition = options.playerPosition === undefined ? position(1, 2, 3) : options.playerPosition;
  const selfPosition = options.selfPosition === undefined ? position(4, 5, 6) : options.selfPosition;
  const blockName = options.block === undefined ? 'Grass Block' : options.block;

  return {
    queryPlayerPosition: vi.fn(() => playerPosition),
    querySelfPosition: vi.fn(() => selfPosition),
    queryBlockAt: vi.fn(() => (blockName === null ? null : { displayName: blockName })),
    doChat: vi.fn(),
    doMoveToXyz: vi.fn(),
  } satisfies GuideBot;
}

describe('handleMsg', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends normal replies', async () => {
    const bot = createBot();

    await handleMsg(createAgent(['你好', '世界']), bot, 'Alice', 'hello');

    expect(bot.doChat).toHaveBeenNthCalledWith(1, '你好');
    expect(bot.doChat).toHaveBeenNthCalledWith(2, '世界');
  });

  it('replies to the where debug hook with the block below', async () => {
    const bot = createBot({ selfPosition: position(1, 2, 3) });

    await handleMsg(createAgent([]), bot, 'Alice', 'where am I');

    expect(bot.queryBlockAt).toHaveBeenCalledWith({ x: 1, y: 1, z: 3 });
    expect(bot.doChat).toHaveBeenCalledWith("I'm at (1.0, 2.0, 3.0). Grass Block under me.");
  });

  it('drops messages when the player position is unavailable', async () => {
    const bot = createBot({ playerPosition: null });

    await handleMsg(createAgent(['你好']), bot, 'Alice', 'hello');

    expect(bot.doChat).not.toHaveBeenCalled();
    expect(bot.doMoveToXyz).not.toHaveBeenCalled();
  });

  it('drops messages when the bot position is unavailable', async () => {
    const bot = createBot({ selfPosition: null });

    await handleMsg(createAgent(['你好']), bot, 'Alice', 'hello');

    expect(bot.doChat).not.toHaveBeenCalled();
  });
});
