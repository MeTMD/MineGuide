import type { LlmReasoningEffort, LlmThinking } from '../data';
import { DebugEventHub, type TokenUsage, type ToolCallRecord, type TurnSource } from './events';

export type TokenKind = 'reasoning' | 'content' | 'tool_call';

export interface RequestFinishInfo {
  status: 'completed' | 'error';
  finishReason: string | null;
  error?: string;
  content: string;
  reasoning: string;
  toolCalls: ToolCallRecord[];
  usage?: TokenUsage;
}

export interface RequestTiming {
  durationMs: number;
  generationMs: number;
  ttftMs: number;
}

export interface RequestSpan {
  readonly requestId: number;
  readonly turn: number;
  readonly step: number;
  noteToken(kind: TokenKind, at: number): void;
  finish(info: RequestFinishInfo): RequestTiming;
  toolStart(callId: string, name: string, args: string, at: number): void;
  toolEnd(callId: string, status: 'completed' | 'error', result: string, at: number): void;
}

export interface TurnSpan {
  readonly turn: number;
  newRequest(
    model: string,
    thinking: LlmThinking,
    effort: LlmReasoningEffort,
    messages: unknown[],
  ): RequestSpan;
  end(): void;
}

export interface Tracer {
  beginTurn(source: TurnSource, inputText: string): TurnSpan;
  command(inputText: string, outputText: string): void;
  error(scope: string, message: string): void;
}

class DebugRequestSpan implements RequestSpan {
  private firstTokenAt?: number;
  private lastTokenAt?: number;
  private readonly toolStarts = new Map<string, number>();

  constructor(
    private readonly hub: DebugEventHub,
    readonly requestId: number,
    readonly turn: number,
    readonly step: number,
    private readonly startAt: number,
  ) {}

  noteToken(kind: TokenKind, at: number): void {
    if (this.firstTokenAt === undefined) {
      this.firstTokenAt = at;
      this.hub.pushPipeline({ kind: 'request_first_token', at, requestId: this.requestId, firstKind: kind });
    }
    this.lastTokenAt = at;
  }

  finish(info: RequestFinishInfo): RequestTiming {
    const at = Date.now();
    const durationMs = at - this.startAt;
    const ttftMs = this.firstTokenAt === undefined ? 0 : this.firstTokenAt - this.startAt;
    const generationMs = this.lastTokenAt === undefined ? 0 : this.lastTokenAt - (this.firstTokenAt ?? this.startAt);
    this.hub.pushPipeline({
      kind: 'request_end',
      at,
      turn: this.turn,
      step: this.step,
      requestId: this.requestId,
      durationMs,
      generationMs,
      status: info.status,
      finishReason: info.finishReason,
      error: info.error,
      content: info.content,
      reasoning: info.reasoning,
      toolCalls: info.toolCalls,
      usage: info.usage,
    });
    return { durationMs, generationMs, ttftMs };
  }

  toolStart(callId: string, name: string, args: string, at: number): void {
    this.toolStarts.set(callId, at);
    this.hub.pushPipeline({
      kind: 'tool_start',
      at,
      turn: this.turn,
      step: this.step,
      requestId: this.requestId,
      callId,
      name,
      arguments: args,
    });
  }

  toolEnd(callId: string, status: 'completed' | 'error', result: string, at: number): void {
    const startedAt = this.toolStarts.get(callId) ?? at;
    this.toolStarts.delete(callId);
    this.hub.pushPipeline({
      kind: 'tool_end',
      at,
      turn: this.turn,
      step: this.step,
      requestId: this.requestId,
      callId,
      durationMs: at - startedAt,
      status,
      result,
    });
  }
}

class DebugTurnSpan implements TurnSpan {
  private step = 0;

  constructor(
    private readonly tracer: DebugTracer,
    private readonly hub: DebugEventHub,
    readonly turn: number,
    private readonly startAt: number,
  ) {}

  newRequest(
    model: string,
    thinking: LlmThinking,
    effort: LlmReasoningEffort,
    messages: unknown[],
  ): RequestSpan {
    this.step += 1;
    const requestId = this.tracer.nextRequestId();
    const at = Date.now();
    this.hub.pushPipeline({
      kind: 'request_start',
      at,
      turn: this.turn,
      step: this.step,
      requestId,
      model,
      thinking,
      reasoningEffort: effort,
      messages,
    });
    return new DebugRequestSpan(this.hub, requestId, this.turn, this.step, at);
  }

  end(): void {
    const at = Date.now();
    this.hub.pushPipeline({ kind: 'turn_end', at, turn: this.turn, durationMs: at - this.startAt });
  }
}

export class DebugTracer implements Tracer {
  private turnCounter = 0;
  private requestCounter = 0;

  constructor(private readonly hub: DebugEventHub) {}

  beginTurn(source: TurnSource, inputText: string): TurnSpan {
    this.turnCounter += 1;
    const at = Date.now();
    this.hub.pushPipeline({ kind: 'turn_start', at, turn: this.turnCounter, source, inputText });
    return new DebugTurnSpan(this, this.hub, this.turnCounter, at);
  }

  command(inputText: string, outputText: string): void {
    this.turnCounter += 1;
    const turn = this.turnCounter;
    const at = Date.now();
    this.hub.pushPipeline({ kind: 'turn_start', at, turn, source: 'command', inputText });
    this.hub.pushPipeline({ kind: 'output', at, turn, text: outputText });
    this.hub.pushPipeline({ kind: 'turn_end', at, turn, durationMs: 0 });
  }

  error(scope: string, message: string): void {
    this.hub.pushPipeline({ kind: 'error', at: Date.now(), scope, message });
  }

  nextRequestId(): number {
    this.requestCounter += 1;
    return this.requestCounter;
  }
}

const noopRequestSpan: RequestSpan = {
  requestId: 0,
  turn: 0,
  step: 0,
  noteToken: () => {},
  finish: () => ({ durationMs: 0, generationMs: 0, ttftMs: 0 }),
  toolStart: () => {},
  toolEnd: () => {},
};

const noopTurnSpan: TurnSpan = {
  turn: 0,
  newRequest: () => noopRequestSpan,
  end: () => {},
};

export const nullTracer: Tracer = {
  beginTurn: () => noopTurnSpan,
  command: () => {},
  error: () => {},
};
