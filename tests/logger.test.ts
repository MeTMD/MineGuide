import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger, parseLogLevel, setLogSink, type LogRecordInput } from '../src/logger';

describe('parseLogLevel', () => {
  it('defaults to info and accepts valid levels', () => {
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('')).toBe('info');
    expect(parseLogLevel('debug')).toBe('debug');
    expect(parseLogLevel('warn')).toBe('warn');
    expect(parseLogLevel('error')).toBe('error');
  });

  it('falls back to info on invalid values', () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      expect(parseLogLevel('verbose')).toBe('info');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('createLogger', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['MG_LOG_LEVEL'];
    setLogSink(undefined);
  });

  it('writes timestamped lines and filters by MG_LOG_LEVEL', () => {
    process.env['MG_LOG_LEVEL'] = 'warn';
    const logger = createLogger('Test');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    const write = vi.mocked(process.stderr.write);
    const lines = write.mock.calls.map((call) => String(call[0]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \[W\] Test - w\n$/);
    expect(lines[1]).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3} \[E\] Test - e\n$/);
  });

  it('delivers records to the sink regardless of level', () => {
    process.env['MG_LOG_LEVEL'] = 'error';
    const records: LogRecordInput[] = [];
    setLogSink((record) => records.push(record));

    createLogger('Test').debug('d', { turn: 1, step: 2, requestId: 3 });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 'debug',
      module: 'Test',
      message: 'd',
      context: { turn: 1, step: 2, requestId: 3 },
    });
  });
});
