import type { TokenUsage } from '../debug/events';

export interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export function toTokenUsage(raw: RawUsage | null | undefined): TokenUsage | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  const prompt = raw.prompt_tokens ?? 0;
  const completion = raw.completion_tokens ?? 0;
  const cached = raw.prompt_cache_hit_tokens ?? raw.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    prompt,
    completion,
    reasoning: raw.completion_tokens_details?.reasoning_tokens ?? 0,
    cached,
    cacheMiss: Math.max(prompt - cached, 0),
    total: raw.total_tokens ?? prompt + completion,
  };
}
