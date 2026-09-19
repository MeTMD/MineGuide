import mineflayer from 'mineflayer';
import mineflayerPathfinder from 'mineflayer-pathfinder';

import type { Bot } from 'mineflayer';
import type { MineGuideConfig } from '../data';
import type { Position } from '../vector';

const { createBot } = mineflayer;
const { goals, Movements, pathfinder } = mineflayerPathfinder;

export class BotStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotStateError';
  }
}

export interface BlockInfo {
  displayName: string;
}

export interface GuideBot {
  queryPlayerPosition(playerName: string): Position | null;
  querySelfPosition(): Position | null;
  queryBlockAt(position: Position): BlockInfo | null;
  doChat(message: string): void;
  doMoveToXyz(x: number, y: number, z: number): void;
}

export class BotAPI implements GuideBot {
  onLogin?: () => void;
  onQuit?: (reason: string) => void;
  onSpawn?: () => void;
  onDeath?: () => void;
  onReceiveMessage?: (username: string, message: string) => void;
  onPlayerJoined?: (username: string) => void;
  onPlayerLeft?: (username: string) => void;

  private readonly config: MineGuideConfig;
  private bot?: Bot;
  private connected = false;
  private movementsSet = false;

  constructor(config: MineGuideConfig) {
    this.config = config;
  }

  connect(): void {
    this.assertDisconnected();
    const bot = createBot({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
    });
    bot.loadPlugin(pathfinder);
    this.bot = bot;
    this.registerListeners(bot);
  }

  doChat(message: string): void {
    this.assertConnected();
    this.bot?.chat(message);
  }

  doWhisper(receiverName: string, message: string): void {
    this.assertConnected();
    this.bot?.whisper(receiverName, message);
  }

  doMoveToXyz(x: number, y: number, z: number): void {
    this.assertConnected();
    const bot = this.bot;
    if (bot === undefined) {
      return;
    }
    if (!this.movementsSet) {
      const movements = new Movements(bot);
      movements.canDig = false;
      bot.pathfinder.setMovements(movements);
      this.movementsSet = true;
    }
    bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
  }

  queryBlockAt(position: Position): BlockInfo | null {
    this.assertConnected();
    const bot = this.bot;
    const origin = bot?.entity?.position;
    if (bot === undefined || origin === undefined) {
      return null;
    }
    const point = origin.clone().set(position.x, position.y, position.z);
    const block = bot.blockAt(point);
    return block ? { displayName: block.displayName } : null;
  }

  querySelfPosition(): Position | null {
    this.assertConnected();
    return this.bot?.entity?.position ?? null;
  }

  queryPlayerPosition(playerName: string): Position | null {
    this.assertConnected();
    return this.bot?.players[playerName]?.entity?.position ?? null;
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new BotStateError('Bot has not connected yet');
    }
  }

  private assertDisconnected(): void {
    if (this.connected) {
      throw new BotStateError('Bot already connected');
    }
  }

  private registerListeners(bot: Bot): void {
    bot.on('chat', (username, message) => {
      if (this.onReceiveMessage && username !== bot.username) {
        this.onReceiveMessage(username, message);
      }
    });
    bot.on('whisper', (username, message) => {
      if (this.onReceiveMessage && username !== bot.username) {
        this.onReceiveMessage(username, message);
      }
    });
    bot.on('login', () => {
      this.connected = true;
      this.onLogin?.();
    });
    bot.on('end', (reason) => {
      this.connected = false;
      this.onQuit?.(reason);
    });
    bot.on('spawn', () => {
      this.onSpawn?.();
    });
    bot.on('death', () => {
      this.onDeath?.();
    });
    bot.on('playerJoined', (player) => {
      if (this.onPlayerJoined && player.username !== bot.username) {
        this.onPlayerJoined(player.username);
      }
    });
    bot.on('playerLeft', (player) => {
      if (this.onPlayerLeft && player.username !== bot.username) {
        this.onPlayerLeft(player.username);
      }
    });
  }
}
