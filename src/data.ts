import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import iniPackage from 'ini';
import { z } from 'zod';

const { parse } = iniPackage;

const sceneAnchorSchema = z.object({
  name: z.string(),
  alias: z.array(z.string()),
  position: z.array(z.number()),
  description: z.string(),
});

const sceneSchema = z.object({
  meta: z.object({
    name: z.string(),
    location: z.string(),
  }),
  anchors: z.array(sceneAnchorSchema),
});

export type SceneAnchor = z.infer<typeof sceneAnchorSchema>;
export type SceneConfig = z.infer<typeof sceneSchema>;

export class ConfigFileNotFoundError extends Error {
  constructor(path: string) {
    super(path);
    this.name = 'ConfigFileNotFoundError';
  }
}

export class ConfigKeyError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = 'ConfigKeyError';
    this.key = key;
  }
}

export class ConfigValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValueError';
  }
}

export interface LlmClientOptions {
  baseURL?: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
}

export interface MineGuideConfig {
  host: string;
  port: number;
  username: string;
  llmModelName: string;
  llmHistoryRounds: number;
  llmClient: LlmClientOptions;
  scene: SceneConfig;
}

interface ParsedIni {
  host: string;
  port: number;
  username: string;
  modelName: string;
  historyRounds: number;
  client: LlmClientOptions;
  dataFile: string;
}

type IniSection = Record<string, string>;

const CLIENT_KEYS: readonly string[] = ['baseURL', 'apiKey', 'timeout', 'maxRetries', 'defaultHeaders'];
const DEFAULT_HISTORY_ROUNDS = 20;

export function getBaseDir(): string {
  return isSeaRun() ? dirname(process.execPath) : process.cwd();
}

function isSeaRun(): boolean {
  const sea = process.getBuiltinModule('node:sea') as { isSea(): boolean } | undefined;
  return sea?.isSea() ?? false;
}

export function parseConfig(configText: string, sceneText: string): MineGuideConfig {
  const parsed = parseIni(configText);
  return {
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    llmModelName: parsed.modelName,
    llmHistoryRounds: parsed.historyRounds,
    llmClient: parsed.client,
    scene: parseScene(sceneText),
  };
}

export function parseIni(configText: string): ParsedIni {
  const contents = parse(configText) as unknown as Record<string, unknown>;
  const connection = requireSection(contents, 'Connection');
  const llm = requireSection(contents, 'LLM');
  const llmClient = requireSection(contents, 'LLMClient');
  const scene = requireSection(contents, 'Scene');

  return {
    host: requireKey(connection, 'host'),
    port: parsePort(requireKey(connection, 'port')),
    username: requireKey(connection, 'username'),
    modelName: requireKey(llm, 'model_name'),
    historyRounds: parseHistoryRounds(llm['history_rounds']),
    client: parseClientOptions(llmClient),
    dataFile: requireKey(scene, 'data_file'),
  };
}

export function parseScene(sceneText: string): SceneConfig {
  let data: unknown;
  try {
    data = JSON.parse(sceneText);
  } catch (error) {
    throw new ConfigValueError(`Invalid scene JSON, ${error instanceof Error ? error.message : error}`);
  }

  const result = sceneSchema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new ConfigValueError(`Invalid scene data, ${details}`);
  }
  return result.data;
}

export function loadConfig(configPath: string, dataDir: string): MineGuideConfig {
  const configText = readTextFile(configPath);
  const parsed = parseIni(configText);
  const sceneText = readTextFile(join(dataDir, parsed.dataFile));

  return {
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    llmModelName: parsed.modelName,
    llmHistoryRounds: parsed.historyRounds,
    llmClient: parsed.client,
    scene: parseScene(sceneText),
  };
}

function readTextFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigFileNotFoundError(path);
    }
    throw error;
  }
}

function requireSection(contents: Record<string, unknown>, name: string): IniSection {
  const section = contents[name];
  if (typeof section !== 'object' || section === null) {
    throw new ConfigKeyError(name);
  }
  return section as IniSection;
}

function requireKey(section: IniSection, key: string): string {
  const value = section[key];
  if (value === undefined) {
    throw new ConfigKeyError(key);
  }
  return value;
}

function parsePort(raw: string): number {
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigValueError(`Invalid port value "${raw}"`);
  }
  return port;
}

function parseHistoryRounds(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_HISTORY_ROUNDS;
  }
  const rounds = Number.parseInt(raw, 10);
  if (!Number.isInteger(rounds) || rounds < 0) {
    throw new ConfigValueError(`Invalid history_rounds value "${raw}"`);
  }
  return rounds;
}

function parseClientOptions(section: IniSection): LlmClientOptions {
  for (const key of Object.keys(section)) {
    if (!CLIENT_KEYS.includes(key)) {
      throw new ConfigValueError(`Unknown key "${key}" in section [LLMClient]`);
    }
  }

  const options: LlmClientOptions = { apiKey: requireKey(section, 'apiKey') };

  const baseURL = section['baseURL'];
  if (baseURL !== undefined) {
    options.baseURL = baseURL;
  }

  const timeout = section['timeout'];
  if (timeout !== undefined) {
    const seconds = Number.parseFloat(timeout);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new ConfigValueError(`Invalid timeout value "${timeout}"`);
    }
    options.timeout = Math.round(seconds * 1000);
  }

  const maxRetries = section['maxRetries'];
  if (maxRetries !== undefined) {
    const retries = Number.parseInt(maxRetries, 10);
    if (!Number.isInteger(retries) || retries < 0) {
      throw new ConfigValueError(`Invalid maxRetries value "${maxRetries}"`);
    }
    options.maxRetries = retries;
  }

  const defaultHeaders = section['defaultHeaders'];
  if (defaultHeaders !== undefined) {
    options.defaultHeaders = parseHeaders(defaultHeaders);
  }

  return options;
}

function parseHeaders(raw: string): Record<string, string> {
  let headers: unknown;
  try {
    headers = JSON.parse(raw);
  } catch {
    throw new ConfigValueError(`Invalid defaultHeaders value "${raw}", expected a JSON object`);
  }

  if (
    typeof headers !== 'object' ||
    headers === null ||
    Array.isArray(headers) ||
    Object.values(headers).some((value) => typeof value !== 'string')
  ) {
    throw new ConfigValueError(`Invalid defaultHeaders value "${raw}", expected a JSON object of strings`);
  }
  return headers as Record<string, string>;
}
