import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const PC_SECTION_START = /^  'pc': \{/;
const PC_SECTION_END = /^  \},?$/;
const VERSION_START = /^    '([^']+)': \{$/;
const VERSION_END = /^    \},?$/;

const ALL = 'all';

export interface MinecraftDataContext {
  dataJsPath: string;
  resolveDir(minecraftVersion: string): string | null;
}

export function parseRequested(value: string | undefined): string[] | 'all' {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      'MC_VERSIONS is required: set it to one or more Minecraft versions (e.g. MC_VERSIONS=1.20.4) or "all" to include every Java version',
    );
  }
  if (trimmed.toLowerCase() === ALL) {
    return 'all';
  }
  const versions = trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (versions.length === 0) {
    throw new Error('MC_VERSIONS does not contain any version');
  }
  return versions;
}

export function loadMinecraftData(): MinecraftDataContext {
  const requireFromHere = createRequire(import.meta.url);
  const requireFromMineflayer = createRequire(requireFromHere.resolve('mineflayer/package.json'));
  const packageDir = dirname(requireFromMineflayer.resolve('minecraft-data/package.json'));
  const minecraftData = requireFromMineflayer('minecraft-data') as (
    version: string,
  ) => { version: { majorVersion: string; type: string } } | null;

  return {
    dataJsPath: join(packageDir, 'data.js'),
    resolveDir: (minecraftVersion: string) => {
      const data = minecraftData(minecraftVersion);
      if (data === null || data.version.type !== 'pc') {
        return null;
      }
      return data.version.majorVersion;
    },
  };
}

export function parsePcBlocks(dataJsText: string): Map<string, string[]> {
  const lines = dataJsText.split(/\r?\n/);
  const blocks = new Map<string, string[]>();
  let inPcSection = false;
  let current: string | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    if (PC_SECTION_START.test(line)) {
      inPcSection = true;
      continue;
    }
    if (!inPcSection) {
      continue;
    }

    if (current === null) {
      const start = line.match(VERSION_START);
      if (start) {
        current = start[1] ?? '';
        buffer = [line];
      } else if (PC_SECTION_END.test(line)) {
        inPcSection = false;
      }
      continue;
    }

    buffer.push(line);
    if (VERSION_END.test(line)) {
      blocks.set(current, buffer);
      current = null;
      buffer = [];
    }
  }

  return blocks;
}

export function selectDirs(
  requested: string[],
  context: MinecraftDataContext,
  blocks: Map<string, string[]>,
): string[] {
  const selected: string[] = [];
  for (const token of requested) {
    const dir = blocks.has(token) ? token : context.resolveDir(token);
    if (dir === null || !blocks.has(dir)) {
      throw new Error(`Cannot resolve Minecraft version "${token}" to a minecraft-data version directory`);
    }
    if (!selected.includes(dir)) {
      selected.push(dir);
    }
  }
  return selected;
}

export function generateDataJs(blocks: Map<string, string[]>, dirs: string[]): string {
  const body = dirs.flatMap((dir) => blocks.get(dir) ?? []).join('\n');
  return `module.exports =\n{\n  'pc': {\n${body}\n  },\n  'bedrock': {}\n}\n`;
}
