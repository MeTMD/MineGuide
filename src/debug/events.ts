import type { LlmReasoningEffort, LlmThinking } from '../data';
import type { LogContext, LogLevel } from '../logger';

export type TurnSource = 'chat' | 'announce' | 'command';

export interface TokenUsage {
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
  cacheMiss: number;
  total: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: string;
}

export interface TurnStartEvent {
  kind: 'turn_start';
  at: number;
  turn: number;
  source: TurnSource;
  inputText: string;
}

export interface RequestStartEvent {
  kind: 'request_start';
  at: number;
  turn: number;
  step: number;
  requestId: number;
  model: string;
  thinking: LlmThinking;
  reasoningEffort: LlmReasoningEffort;
  messages: unknown[];
}

export interface RequestFirstTokenEvent {
  kind: 'request_first_token';
  at: number;
  requestId: number;
  firstKind: 'reasoning' | 'content' | 'tool_call';
}

export interface RequestEndEvent {
  kind: 'request_end';
  at: number;
  turn: number;
  step: number;
  requestId: number;
  durationMs: number;
  generationMs: number;
  status: 'completed' | 'error';
  finishReason: string | null;
  error?: string;
  content: string;
  reasoning: string;
  toolCalls: ToolCallRecord[];
  usage?: TokenUsage;
}

export interface ToolStartEvent {
  kind: 'tool_start';
  at: number;
  turn: number;
  step: number;
  requestId: number;
  callId: string;
  name: string;
  arguments: string;
}

export interface ToolEndEvent {
  kind: 'tool_end';
  at: number;
  turn: number;
  step: number;
  requestId: number;
  callId: string;
  durationMs: number;
  status: 'completed' | 'error';
  result: string;
}

export interface TurnEndEvent {
  kind: 'turn_end';
  at: number;
  turn: number;
  durationMs: number;
}

export interface OutputEvent {
  kind: 'output';
  at: number;
  turn: number;
  text: string;
}

export interface ErrorEvent {
  kind: 'error';
  at: number;
  scope: string;
  message: string;
}

export type PipelineEvent =
  | TurnStartEvent
  | RequestStartEvent
  | RequestFirstTokenEvent
  | RequestEndEvent
  | ToolStartEvent
  | ToolEndEvent
  | TurnEndEvent
  | OutputEvent
  | ErrorEvent;

export type DebugRecord = PipelineRecord | LogRecord;

export type PipelineRecord = PipelineEvent & { id: number };

export interface LogRecord {
  id: number;
  at: number;
  level: LogLevel;
  module: string;
  message: string;
  context: LogContext;
}

export interface StoreCaps {
  maxRecords: number;
  maxBytes: number;
}

export interface DebugHubOptions {
  pipelineCaps?: StoreCaps;
  logCaps?: StoreCaps;
}

export const PIPELINE_CAPS: StoreCaps = { maxRecords: 2000, maxBytes: 32 * 1024 * 1024 };
export const LOG_CAPS: StoreCaps = { maxRecords: 500, maxBytes: 4 * 1024 * 1024 };

function recordSize(record: unknown): number {
  return Buffer.byteLength(JSON.stringify(record) ?? 'null');
}

class RingStore<T> {
  private readonly records: T[] = [];
  private bytes = 0;

  constructor(private readonly caps: StoreCaps) {}

  push(record: T): void {
    this.records.push(record);
    this.bytes += recordSize(record);
    while (this.records.length > this.caps.maxRecords || this.bytes > this.caps.maxBytes) {
      if (this.records.length <= 1) {
        break;
      }
      const removed = this.records.shift();
      this.bytes -= recordSize(removed);
    }
  }

  all(): T[] {
    return [...this.records];
  }

  clear(): void {
    this.records.length = 0;
    this.bytes = 0;
  }
}

export class DebugEventHub {
  private readonly pipeline: RingStore<PipelineRecord>;
  private readonly logs: RingStore<LogRecord>;
  private readonly listeners = new Set<(record: DebugRecord) => void>();
  private nextId = 1;

  constructor(options: DebugHubOptions = {}) {
    this.pipeline = new RingStore(options.pipelineCaps ?? PIPELINE_CAPS);
    this.logs = new RingStore(options.logCaps ?? LOG_CAPS);
  }

  pushPipeline(event: PipelineEvent): PipelineRecord {
    const record = { ...event, id: this.nextId++ } as PipelineRecord;
    this.pipeline.push(record);
    this.emit(record);
    return record;
  }

  pushLog(level: LogLevel, module: string, message: string, context: LogContext = {}): LogRecord {
    const record: LogRecord = {
      id: this.nextId++,
      at: Date.now(),
      level,
      module,
      message,
      context,
    };
    this.logs.push(record);
    this.emit(record);
    return record;
  }

  subscribe(listener: (record: DebugRecord) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(record: DebugRecord): void {
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch {
        // A broken subscriber must never break the bot.
      }
    }
  }

  pipelineRecords(): PipelineRecord[] {
    return this.pipeline.all();
  }

  logRecords(): LogRecord[] {
    return this.logs.all();
  }

  since(lastId: number): DebugRecord[] {
    return [...this.pipeline.all(), ...this.logs.all()]
      .filter((record) => record.id > lastId)
      .sort((left, right) => left.id - right.id);
  }

  clear(): void {
    this.pipeline.clear();
    this.logs.clear();
  }
}
