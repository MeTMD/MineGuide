import { join } from 'node:path';

import { BotAPI, type GuideBot } from './api/bot';
import { Agent, type ToolRuntime } from './chat/agent';
import { ConfigFileNotFoundError, ConfigKeyError, getBaseDir, loadConfig, type MineGuideConfig } from './data';
import { DebugEventHub } from './debug/events';
import { DebugServer } from './debug/server';
import { DebugTracer, type Tracer, nullTracer } from './debug/tracer';
import { createLogger, installGlobalErrorHandlers, setLogSink } from './logger';
import { SerialQueue } from './queue';
import { formatPosition, type Position } from './vector';

const logger = createLogger('Core');

export const ENV_FILE = 'mg.config.env';

const QUEUE_CAPACITY = 8;

export interface ChatAgent {
  chat(username: string, userPosition: Position, selfPosition: Position, message: string): AsyncGenerator<string>;
  announce(event: string): AsyncGenerator<string>;
}

async function speak(stream: AsyncGenerator<string>, bot: GuideBot): Promise<void> {
  for await (const sentence of stream) {
    logger.debug(`Send message: ${sentence}`);
    bot.doChat(sentence);
  }
}

export async function handleMsg(
  agent: ChatAgent,
  bot: GuideBot,
  username: string,
  message: string,
  tracer: Tracer = nullTracer,
): Promise<void> {
  const userPosition = bot.queryPlayerPosition(username);
  const selfPosition = bot.querySelfPosition();
  if (userPosition === null || selfPosition === null) {
    logger.warn(`Position of player ${username} or the bot is unavailable, message dropped`);
    return;
  }

  if (message.includes('where')) {
    logger.debug(`Currently at ${formatPosition(selfPosition)}`);
    const below = bot.queryBlockAt({ x: selfPosition.x, y: selfPosition.y - 1, z: selfPosition.z });
    const reply = `I'm at ${formatPosition(selfPosition)}. ${below ? below.displayName : 'null'} under me.`;
    tracer.command(message, reply);
    bot.doChat(reply);
    return;
  }

  logger.debug(`User ${username} said: ${message}`);
  await speak(agent.chat(username, userPosition, selfPosition, message), bot);
}

function createDebug(config: MineGuideConfig): { tracer: Tracer; hub?: DebugEventHub } {
  if (!config.debug.enabled) {
    return { tracer: nullTracer };
  }
  const hub = new DebugEventHub();
  setLogSink((record) => hub.pushLog(record.level, record.module, record.message, record.context));
  return { tracer: new DebugTracer(hub), hub };
}

export async function main(): Promise<void> {
  installGlobalErrorHandlers();
  logger.info('Welcome to MineGuide backend');

  let config: MineGuideConfig;
  try {
    logger.info('Loading env config');
    const baseDir = getBaseDir();
    config = loadConfig(join(baseDir, ENV_FILE), join(baseDir, 'data'));
  } catch (error) {
    logger.error('Failed to load env config');
    if (error instanceof ConfigFileNotFoundError) {
      logger.error(`Please ensure the file '${ENV_FILE}' exists`);
    } else if (error instanceof ConfigKeyError) {
      logger.error(`Missing config section or key ${error.key}`);
    } else {
      logger.error(`Cause ${error instanceof Error ? error.message : error}`);
    }
    return;
  }

  const { tracer, hub } = createDebug(config);
  if (hub !== undefined) {
    const server = new DebugServer(hub, config);
    const started = await server.start();
    if (started.ok) {
      logger.info(`Debug page: ${server.url()}`);
    } else {
      logger.warn(`Debug page disabled: ${started.error?.message ?? started.error}`);
    }
  }

  try {
    logger.info('Starting bot');
    const bot = new BotAPI(config);
    bot.onLogin = () => logger.info('Bot login succeeded');

    const runtime: ToolRuntime = {
      async moveTo(x: number, y: number, z: number): Promise<string> {
        bot.doMoveToXyz(x, y, z);
        return `已出发前往 (${x}, ${y}, ${z})`;
      },
    };
    const agent = new Agent(config, runtime, undefined, tracer);

    const queue = new SerialQueue(QUEUE_CAPACITY, {
      onOverflow: () => logger.warn('Message queue is full, dropped the newest message'),
      onError: (error) =>
        logger.error(`Error occurred while handling message, ${error instanceof Error ? error.message : error}`),
    });
    bot.onReceiveMessage = (username, message) => {
      queue.push(() => handleMsg(agent, bot, username, message, tracer));
    };
    bot.onNavigationArrived = (target) => {
      queue.push(() => speak(agent.announce(`导航事件：已抵达目标 (${formatPosition(target)})`), bot));
    };
    bot.onNavigationFailed = (target, reason) => {
      queue.push(() =>
        speak(agent.announce(`导航事件：无法抵达目标 (${formatPosition(target)})，原因：${reason}`), bot),
      );
    };

    bot.connect();
  } catch {
    logger.error('Failed to connect to the server');
    return;
  }

  logger.info('Press Ctrl+C to stop running');
  setInterval(() => {}, 1 << 30);
}
