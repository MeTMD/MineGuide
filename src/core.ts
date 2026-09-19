import { join } from 'node:path';

import { BotAPI, type GuideBot } from './api/bot';
import { Agent } from './chat/agent';
import { ConfigFileNotFoundError, ConfigKeyError, getBaseDir, loadConfig, type MineGuideConfig } from './data';
import { createLogger } from './logger';
import { SerialQueue } from './queue';
import { formatPosition, type Position } from './vector';

const logger = createLogger('Core');

export const ENV_FILE = 'mg.config.env';
export const FC_PATTERN = /^FCFC::(\w+?)((::.+?)*?)::CFCF/;

const QUEUE_CAPACITY = 8;

export interface ChatAgent {
  chat(username: string, userPosition: Position, selfPosition: Position, message: string): AsyncGenerator<string>;
}

function formatPythonTuple(items: string[]): string {
  const inner = items.map((item) => `'${item}'`).join(', ');
  return items.length === 1 ? `(${inner},)` : `(${inner})`;
}

export async function handleMsg(
  agent: ChatAgent,
  bot: GuideBot,
  username: string,
  message: string,
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
    bot.doChat(`I'm at ${formatPosition(selfPosition)}. ${below ? below.displayName : 'null'} under me.`);
  } else {
    logger.debug(`User ${username} said: ${message}`);
    let silence = false;
    for await (const sentence of agent.chat(username, userPosition, selfPosition, message)) {
      const fcMatch = sentence.match(FC_PATTERN);
      if (fcMatch) {
        try {
          const fcName = fcMatch[1] ?? '';
          const fcParams = (fcMatch[2] ?? '').split('::').filter(Boolean);
          logger.info(`Execute FunctionCall ${fcName} ${formatPythonTuple(fcParams)}`);
          if (fcName === 'MoveTo') {
            const coordinates = fcParams.map((param) => Number(param));
            if (coordinates.length !== 3 || coordinates.some((coordinate) => !Number.isFinite(coordinate))) {
              throw new Error('Invalid MoveTo parameters');
            }
            bot.doMoveToXyz(coordinates[0] ?? 0, coordinates[1] ?? 0, coordinates[2] ?? 0);
          }
          if (fcName === 'Silence') {
            silence = true;
          }
        } catch (error) {
          logger.error(`Error occurred in FunctionCall, ${error instanceof Error ? error.message : error}`);
        }
      } else if (!silence) {
        logger.debug(`Send message: ${sentence}`);
        bot.doChat(sentence);
      }
    }
  }
}

export async function main(): Promise<void> {
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

  let agent: Agent;
  try {
    logger.info('Tuning LLM');
    agent = await Agent.create(config);
  } catch {
    logger.error('Failed to access LLM API');
    logger.error('Please ensure your LLM API config');
    return;
  }

  try {
    logger.info('Starting bot');
    const bot = new BotAPI(config);
    bot.onLogin = () => logger.info('Bot login succeeded');

    const queue = new SerialQueue(QUEUE_CAPACITY, {
      onOverflow: () => logger.warn('Message queue is full, dropped the newest message'),
      onError: (error) =>
        logger.error(`Error occurred while handling message, ${error instanceof Error ? error.message : error}`),
    });
    bot.onReceiveMessage = (username, message) => {
      queue.push(() => handleMsg(agent, bot, username, message));
    };

    bot.connect();
  } catch {
    logger.error('Failed to connect to the server');
    return;
  }

  logger.info('Press Ctrl+C to stop running');
  setInterval(() => {}, 1 << 30);
}
