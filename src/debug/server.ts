import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { MineGuideConfig } from '../data';
import { DebugEventHub, type DebugRecord } from './events';
import { DEBUG_UI_HTML } from './ui';

const HEARTBEAT_MS = 15000;
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export interface DebugStartResult {
  ok: boolean;
  port?: number;
  error?: Error;
}

export class DebugServer {
  readonly token: string;
  private readonly hub: DebugEventHub;
  private readonly config: MineGuideConfig;
  private readonly port: number;
  private server?: Server;
  private actualPort?: number;

  constructor(hub: DebugEventHub, config: MineGuideConfig) {
    this.hub = hub;
    this.config = config;
    this.port = config.debug.port;
    this.token = randomBytes(8).toString('hex');
  }

  url(): string {
    const port = this.actualPort ?? this.port;
    return `http://127.0.0.1:${port}/?token=${this.token}`;
  }

  start(): Promise<DebugStartResult> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => this.handle(req, res));
      this.server = server;
      server.on('error', (error) => {
        resolve({ ok: false, error });
      });
      server.listen(this.port, '127.0.0.1', () => {
        const address = server.address();
        this.actualPort = typeof address === 'object' && address !== null ? address.port : this.port;
        resolve({ ok: true, port: this.actualPort });
      });
    });
  }

  close(): void {
    this.server?.close();
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!this.isAllowedHost(req.headers.host) || !this.isAuthorized(req, url)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const method = req.method ?? 'GET';
    if (method === 'GET' && url.pathname === '/') {
      this.send(res, 200, 'text/html; charset=utf-8', DEBUG_UI_HTML);
      return;
    }
    if (method === 'GET' && url.pathname === '/api/state') {
      this.sendJson(res, 200, {
        config: this.configSummary(),
        pipeline: this.hub.pipelineRecords(),
        logs: this.hub.logRecords(),
      });
      return;
    }
    if (method === 'GET' && url.pathname === '/api/events') {
      this.streamEvents(req, res, url);
      return;
    }
    if (method === 'POST' && url.pathname === '/api/clear') {
      this.hub.clear();
      this.sendJson(res, 200, { ok: true });
      return;
    }
    this.send(res, 404, 'text/plain; charset=utf-8', 'Not Found');
  }

  private isAllowedHost(host: string | undefined): boolean {
    if (host === undefined) {
      return false;
    }
    const normalized = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0] ?? '';
    return ALLOWED_HOSTS.has(normalized);
  }

  private isAuthorized(req: IncomingMessage, url: URL): boolean {
    const header = req.headers['x-debug-token'];
    const provided = url.searchParams.get('token') ?? (Array.isArray(header) ? header[0] : header);
    return provided === this.token;
  }

  private streamEvents(req: IncomingMessage, res: ServerResponse, url: URL): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    const headerLast = req.headers['last-event-id'];
    const headerValue = Array.isArray(headerLast) ? headerLast[0] : headerLast;
    const lastEventId = Number.parseInt(headerValue ?? url.searchParams.get('lastEventId') ?? '0', 10);
    const since = Number.isNaN(lastEventId) ? 0 : lastEventId;
    for (const record of this.hub.since(since)) {
      this.writeEvent(res, record);
    }

    const unsubscribe = this.hub.subscribe((record) => this.writeEvent(res, record));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  private writeEvent(res: ServerResponse, record: DebugRecord): void {
    const event = 'kind' in record ? record.kind : 'log';
    res.write(`id: ${record.id}\nevent: ${event}\ndata: ${JSON.stringify(record)}\n\n`);
  }

  private configSummary(): unknown {
    return {
      username: this.config.username,
      host: this.config.host,
      port: this.config.port,
      model: this.config.llmModelName,
      thinking: this.config.llmThinking,
      reasoningEffort: this.config.llmReasoningEffort,
      scene: {
        name: this.config.scene.meta.name,
        location: this.config.scene.meta.location,
        anchorCount: this.config.scene.anchors.length,
      },
    };
  }

  private sendJson(res: ServerResponse, status: number, payload: unknown): void {
    this.send(res, status, 'application/json; charset=utf-8', JSON.stringify(payload));
  }

  private send(res: ServerResponse, status: number, contentType: string, body: string): void {
    res.writeHead(status, { 'Content-Type': contentType });
    res.end(body);
  }
}
