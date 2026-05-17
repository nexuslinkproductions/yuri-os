import type { TokenSpend } from './types';

const NOW = Date.now();
const H24 = 24 * 60 * 60 * 1000;

export const MOCK_SPEND: TokenSpend[] = [
  { model: 'deepseek-v4-pro', cost: 2.10, tokensIn: 520000, tokensOut: 330000, ts: NOW },
  { model: 'deepseek-v4-flash', cost: 1.60, tokensIn: 2800000, tokensOut: 1400000, ts: NOW },
  { model: 'gpt-oss', cost: 0, tokensIn: 0, tokensOut: 0, ts: NOW },
  { model: 'qwen', cost: 0, tokensIn: 0, tokensOut: 0, ts: NOW },
  { model: 'claude-sonnet-4-6', cost: 0.85, tokensIn: 75000, tokensOut: 45000, ts: NOW },
  { model: 'claude-opus-4-7', cost: 1.40, tokensIn: 28000, tokensOut: 17000, ts: NOW },
  { model: 'swarm-ruflo', cost: 0, tokensIn: 0, tokensOut: 0, ts: NOW },
];

export function totalCost(): number {
  return MOCK_SPEND.reduce((sum, s) => sum + s.cost, 0);
}

export function todayCost(): number {
  return totalCost();
}

export function spendByModel(): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of MOCK_SPEND) {
    map.set(s.model, s.cost);
  }
  return map;
}
