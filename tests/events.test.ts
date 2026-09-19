import { describe, expect, it, vi } from 'vitest';

import { DebugEventHub, type PipelineEvent } from '../src/debug/events';

function errorEvent(scope: string, at = Date.now()): PipelineEvent {
  return { kind: 'error', at, scope, message: 'm' };
}

describe('DebugEventHub', () => {
  it('assigns monotonic ids and merges pipeline and logs in since()', () => {
    const hub = new DebugEventHub();
    const pipeline = hub.pushPipeline(errorEvent('a'));
    const log = hub.pushLog('info', 'M', 'hello');

    expect(log.id).toBeGreaterThan(pipeline.id);
    expect(hub.since(pipeline.id).map((record) => record.id)).toEqual([log.id]);
  });

  it('evicts the oldest pipeline records when the count cap is hit', () => {
    const hub = new DebugEventHub({ pipelineCaps: { maxRecords: 2, maxBytes: 1 << 30 } });
    hub.pushPipeline(errorEvent('1'));
    hub.pushPipeline(errorEvent('2'));
    hub.pushPipeline(errorEvent('3'));

    expect(hub.pipelineRecords().map((record) => (record.kind === 'error' ? record.scope : ''))).toEqual([
      '2',
      '3',
    ]);
  });

  it('evicts records by byte size', () => {
    const hub = new DebugEventHub({ pipelineCaps: { maxRecords: 100, maxBytes: 30 } });
    hub.pushPipeline({ kind: 'error', at: 1, scope: 'x'.repeat(50), message: '' });
    hub.pushPipeline({ kind: 'error', at: 2, scope: 'y', message: '' });

    const records = hub.pipelineRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.kind === 'error' ? records[0].scope : '').toBe('y');
  });

  it('keeps logs in a separate buffer', () => {
    const hub = new DebugEventHub({ logCaps: { maxRecords: 1, maxBytes: 1 << 30 } });
    hub.pushLog('info', 'M', 'a');
    hub.pushLog('info', 'M', 'b');

    expect(hub.logRecords().map((record) => record.message)).toEqual(['b']);
    expect(hub.pipelineRecords()).toHaveLength(0);
  });

  it('notifies subscribers and survives throwing listeners', () => {
    const hub = new DebugEventHub();
    const listener = vi.fn();
    hub.subscribe(() => {
      throw new Error('boom');
    });
    const unsubscribe = hub.subscribe(listener);

    hub.pushPipeline(errorEvent('x'));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    hub.pushPipeline(errorEvent('y'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears both buffers', () => {
    const hub = new DebugEventHub();
    hub.pushPipeline(errorEvent('a'));
    hub.pushLog('info', 'M', 'b');
    hub.clear();

    expect(hub.pipelineRecords()).toHaveLength(0);
    expect(hub.logRecords()).toHaveLength(0);
  });
});
