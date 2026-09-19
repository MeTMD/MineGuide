import http from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DebugEventHub } from '../src/debug/events';
import { DebugServer } from '../src/debug/server';
import { parseConfig, type MineGuideConfig } from '../src/data';

const SCENE_JSON = JSON.stringify({
  meta: { name: '场景', location: '地点' },
  anchors: [{ name: '正门', alias: [], position: [1, 2, 3], description: '描述' }],
});

function makeConfig(): MineGuideConfig {
  const config = parseConfig(
    [
      '[Connection]',
      'host = 127.0.0.1',
      'port = 25565',
      'username = Bot',
      '[Scene]',
      'data_file = scene.json',
      '[LLM]',
      'model_name = test-model',
      '[LLMClient]',
      'apiKey = secret-key',
    ].join('\n'),
    SCENE_JSON,
  );
  return { ...config, debug: { enabled: true, port: 0 } };
}

describe('DebugServer', () => {
  let hub: DebugEventHub;
  let server: DebugServer;
  let base: string;

  beforeAll(async () => {
    hub = new DebugEventHub();
    server = new DebugServer(hub, makeConfig());
    const started = await server.start();
    expect(started.ok).toBe(true);
    base = `http://127.0.0.1:${started.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('serves the page with a valid token', async () => {
    const res = await fetch(`${base}/?token=${server.token}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('MineGuide Agent Trace');
  });

  it('rejects missing or wrong tokens', async () => {
    expect((await fetch(`${base}/`)).status).toBe(403);
    expect((await fetch(`${base}/?token=deadbeef`)).status).toBe(403);
  });

  it('rejects disallowed Host headers', async () => {
    const port = Number.parseInt(new URL(base).port, 10);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: `/?token=${server.token}`, headers: { Host: 'evil.example.com' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });

    expect(status).toBe(403);
  });

  it('returns sanitized state and clears buffers', async () => {
    hub.pushPipeline({ kind: 'error', at: 1, scope: 's', message: 'm' });

    const state = (await (await fetch(`${base}/api/state?token=${server.token}`)).json()) as {
      config: Record<string, unknown>;
      pipeline: unknown[];
    };
    expect(state.config['apiKey']).toBeUndefined();
    expect(state.config['model']).toBe('test-model');
    expect(state.pipeline).toHaveLength(1);

    const cleared = await fetch(`${base}/api/clear?token=${server.token}`, { method: 'POST' });
    expect(cleared.status).toBe(200);
    expect(hub.pipelineRecords()).toHaveLength(0);
  });

  it('streams records over SSE', async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/events?token=${server.token}`, { signal: controller.signal });
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    setTimeout(() => hub.pushPipeline({ kind: 'error', at: 2, scope: 'sse', message: 'm' }), 20);

    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('data:') && reader !== undefined) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    controller.abort();

    expect(text).toContain('event: error');
    expect(text).toContain('"scope":"sse"');
  });
});
