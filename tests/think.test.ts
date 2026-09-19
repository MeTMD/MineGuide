import { describe, expect, it } from 'vitest';

import { ThinkStripper } from '../src/chat/think';

function pushAll(stripper: ThinkStripper, chunks: string[]): string {
  return chunks.map((chunk) => stripper.push(chunk)).join('');
}

describe('ThinkStripper', () => {
  it('removes a think block contained in a single chunk', () => {
    const stripper = new ThinkStripper();
    expect(pushAll(stripper, ['<think>hidden</think>visible'])).toBe('visible');
    expect(stripper.flush()).toBe('');
  });

  it('removes a think block split across chunks', () => {
    const stripper = new ThinkStripper();
    expect(pushAll(stripper, ['<thi', 'nk>hidden</thi', 'nk>visible'])).toBe('visible');
  });

  it('keeps text before and after think blocks', () => {
    const stripper = new ThinkStripper();
    expect(pushAll(stripper, ['before<think>hidden</think>after'])).toBe('beforeafter');
  });

  it('handles multiple think blocks', () => {
    const stripper = new ThinkStripper();
    expect(pushAll(stripper, ['a<think>b</think>c<think>d</think>e'])).toBe('ace');
  });

  it('drops an unterminated think block', () => {
    const stripper = new ThinkStripper();
    expect(pushAll(stripper, ['<think>hidden'])).toBe('');
    expect(stripper.flush()).toBe('');
  });

  it('emits a dangling partial tag on flush', () => {
    const stripper = new ThinkStripper();
    expect(pushAll(stripper, ['abc<thi'])).toBe('abc');
    expect(stripper.flush()).toBe('<thi');
  });

  it('does not treat a bare "<" as a tag', () => {
    const stripper = new ThinkStripper();
    expect(pushAll(stripper, ['a<', 'b'])).toBe('a<b');
  });
});
