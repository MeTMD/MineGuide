import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ConfigFileNotFoundError,
  ConfigKeyError,
  ConfigValueError,
  loadConfig,
  parseConfig,
  parseIni,
  parseScene,
} from '../src/data';

const SCENE_JSON = JSON.stringify({
  meta: { name: '示例景点', location: '中国北京' },
  anchors: [
    { name: '正门', alias: ['东门', '主门'], position: [30, 60, 20], description: '描述' },
  ],
  routes: [{ start: '正门', end: '主楼', pathways: [] }],
});

interface IniOptions {
  connection?: string[];
  scene?: string[];
  llm?: string[];
  client?: string[];
  debug?: string[];
}

function buildIni(options: IniOptions = {}): string {
  return [
    '[Connection]',
    ...(options.connection ?? ['host = 127.0.0.1', 'port = 25565', 'username = Bot']),
    '[Scene]',
    ...(options.scene ?? ['data_file = example_scene.json']),
    '[LLM]',
    ...(options.llm ?? ['model_name = gpt-4o']),
    '[LLMClient]',
    ...(options.client ?? ['baseURL = https://api.openai.com/v1', 'apiKey = test-key']),
    ...(options.debug !== undefined ? ['[Debug]', ...options.debug] : []),
  ].join('\n');
}

describe('parseIni', () => {
  it('parses connection, scene and LLM fields', () => {
    const parsed = parseIni(buildIni());

    expect(parsed.host).toBe('127.0.0.1');
    expect(parsed.port).toBe(25565);
    expect(parsed.username).toBe('Bot');
    expect(parsed.modelName).toBe('gpt-4o');
    expect(parsed.dataFile).toBe('example_scene.json');
    expect(parsed.client.apiKey).toBe('test-key');
    expect(parsed.client.baseURL).toBe('https://api.openai.com/v1');
  });

  it('defaults [LLM] options', () => {
    const parsed = parseIni(buildIni());
    expect(parsed.maxToolSubturns).toBe(4);
    expect(parsed.maxContextTokens).toBe(50000);
    expect(parsed.thinking).toBe('enabled');
    expect(parsed.reasoningEffort).toBe('high');
  });

  it('parses [LLM] options', () => {
    const parsed = parseIni(
      buildIni({
        llm: [
          'model_name = gpt-4o',
          'max_tool_subturns = 2',
          'max_context_tokens = 12345',
          'thinking = disabled',
          'reasoning_effort = low',
        ],
      }),
    );
    expect(parsed.maxToolSubturns).toBe(2);
    expect(parsed.maxContextTokens).toBe(12345);
    expect(parsed.thinking).toBe('disabled');
    expect(parsed.reasoningEffort).toBe('low');
  });

  it('rejects unknown [LLM] keys', () => {
    expect(() => parseIni(buildIni({ llm: ['model_name = gpt-4o', 'history_rounds = 20'] }))).toThrow(
      ConfigValueError,
    );
  });

  it('converts timeout from seconds to milliseconds', () => {
    expect(parseIni(buildIni({ client: ['apiKey = k', 'timeout = 30'] })).client.timeout).toBe(30000);
    expect(parseIni(buildIni({ client: ['apiKey = k', 'timeout = 2.5'] })).client.timeout).toBe(2500);
  });

  it('parses maxRetries and defaultHeaders', () => {
    const parsed = parseIni(
      buildIni({ client: ['apiKey = k', 'maxRetries = 3', 'defaultHeaders = {"X-Test": "1"}'] }),
    );
    expect(parsed.client.maxRetries).toBe(3);
    expect(parsed.client.defaultHeaders).toEqual({ 'X-Test': '1' });
  });

  it('rejects unknown [LLMClient] keys', () => {
    expect(() => parseIni(buildIni({ client: ['apiKey = k', 'foo = bar'] }))).toThrow(ConfigValueError);
  });

  it('rejects legacy snake_case client keys', () => {
    expect(() => parseIni(buildIni({ client: ['base_url = http://x', 'api_key = k'] }))).toThrow(
      ConfigValueError,
    );
  });

  it('rejects a missing section', () => {
    expect(() => parseIni('[Connection]\nhost = 127.0.0.1\n')).toThrow(ConfigKeyError);
  });

  it('rejects a missing key', () => {
    expect(() => parseIni(buildIni({ connection: ['host = 127.0.0.1', 'username = Bot'] }))).toThrow(
      ConfigKeyError,
    );
  });

  it('requires apiKey', () => {
    expect(() => parseIni(buildIni({ client: ['baseURL = http://x'] }))).toThrow(ConfigKeyError);
  });

  it('defaults [Debug] options', () => {
    expect(parseIni(buildIni()).debug).toEqual({ enabled: true, port: 25564 });
  });

  it('parses [Debug] options', () => {
    expect(parseIni(buildIni({ debug: ['enabled = false', 'port = 9000'] })).debug).toEqual({
      enabled: false,
      port: 9000,
    });
  });

  it('rejects unknown [Debug] keys', () => {
    expect(() => parseIni(buildIni({ debug: ['foo = bar'] }))).toThrow(ConfigValueError);
  });

  it('rejects invalid [Debug] values', () => {
    expect(() => parseIni(buildIni({ debug: ['enabled = yes'] }))).toThrow(ConfigValueError);
    expect(() => parseIni(buildIni({ debug: ['port = 0'] }))).toThrow(ConfigValueError);
  });

  it('rejects invalid numeric values', () => {
    expect(() => parseIni(buildIni({ connection: ['host = h', 'port = 0', 'username = u'] }))).toThrow(
      ConfigValueError,
    );
    expect(() => parseIni(buildIni({ connection: ['host = h', 'port = 99999', 'username = u'] }))).toThrow(
      ConfigValueError,
    );
    expect(() => parseIni(buildIni({ llm: ['model_name = m', 'max_tool_subturns = 0'] }))).toThrow(
      ConfigValueError,
    );
    expect(() => parseIni(buildIni({ llm: ['model_name = m', 'max_context_tokens = 0'] }))).toThrow(
      ConfigValueError,
    );
    expect(() => parseIni(buildIni({ llm: ['model_name = m', 'thinking = off'] }))).toThrow(ConfigValueError);
    expect(() => parseIni(buildIni({ llm: ['model_name = m', 'reasoning_effort = ultra'] }))).toThrow(
      ConfigValueError,
    );
    expect(() => parseIni(buildIni({ client: ['apiKey = k', 'timeout = 0'] }))).toThrow(ConfigValueError);
    expect(() => parseIni(buildIni({ client: ['apiKey = k', 'maxRetries = -1'] }))).toThrow(ConfigValueError);
  });

  it('rejects invalid defaultHeaders values', () => {
    expect(() => parseIni(buildIni({ client: ['apiKey = k', 'defaultHeaders = not-json'] }))).toThrow(
      ConfigValueError,
    );
    expect(() => parseIni(buildIni({ client: ['apiKey = k', 'defaultHeaders = {"X": 1}'] }))).toThrow(
      ConfigValueError,
    );
  });
});

describe('parseScene', () => {
  it('accepts scene data and strips unknown keys', () => {
    const scene = parseScene(SCENE_JSON);

    expect(scene.meta).toEqual({ name: '示例景点', location: '中国北京' });
    expect(scene.anchors).toHaveLength(1);
    expect(scene.anchors[0]?.position).toEqual([30, 60, 20]);
    expect(Object.hasOwn(scene, 'routes')).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseScene('{not json')).toThrow(ConfigValueError);
  });

  it('rejects missing or mistyped fields', () => {
    expect(() => parseScene(JSON.stringify({ meta: { name: 'a' }, anchors: [] }))).toThrow(ConfigValueError);
    expect(() =>
      parseScene(
        JSON.stringify({
          meta: { name: 'a', location: 'b' },
          anchors: [{ name: 'x', alias: [], position: ['30'], description: 'd' }],
        }),
      ),
    ).toThrow(ConfigValueError);
  });
});

describe('parseConfig', () => {
  it('combines ini and scene data', () => {
    const config = parseConfig(buildIni(), SCENE_JSON);

    expect(config.host).toBe('127.0.0.1');
    expect(config.scene.meta.location).toBe('中国北京');
  });
});

describe('loadConfig', () => {
  it('loads config and scene from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mineguide-'));
    try {
      writeFileSync(join(dir, 'mg.config.env'), buildIni(), 'utf8');
      writeFileSync(join(dir, 'example_scene.json'), SCENE_JSON, 'utf8');

      const config = loadConfig(join(dir, 'mg.config.env'), dir);
      expect(config.username).toBe('Bot');
      expect(config.scene.meta.name).toBe('示例景点');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws ConfigFileNotFoundError when the config file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mineguide-'));
    try {
      expect(() => loadConfig(join(dir, 'missing.env'), dir)).toThrow(ConfigFileNotFoundError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws ConfigFileNotFoundError when the scene file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mineguide-'));
    try {
      writeFileSync(join(dir, 'mg.config.env'), buildIni(), 'utf8');
      expect(() => loadConfig(join(dir, 'mg.config.env'), dir)).toThrow(ConfigFileNotFoundError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
