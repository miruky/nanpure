import { describe, expect, it } from 'vitest';
import { encodeShare, parseShare, shareUrl } from './share';

describe('共有リンク', () => {
  it('encode と parse は往復する', () => {
    const params = { seed: 123456, difficulty: 'hard' as const };
    const parsed = parseShare(encodeShare(params));
    expect(parsed).toEqual(params);
  });

  it('全難易度を往復できる', () => {
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as const) {
      const parsed = parseShare(encodeShare({ seed: 7, difficulty }));
      expect(parsed?.difficulty).toBe(difficulty);
    }
  });

  it('空・不正なハッシュは null', () => {
    expect(parseShare('')).toBeNull();
    expect(parseShare('#')).toBeNull();
    expect(parseShare('#s=abc')).toBeNull(); // 難易度が欠けている
    expect(parseShare('#s=1&d=nonsense')).toBeNull();
  });

  it('shareUrl は既存のハッシュを置き換える', () => {
    const url = shareUrl('https://example.com/nanpure/#old=1', {
      seed: 42,
      difficulty: 'medium',
    });
    expect(url.startsWith('https://example.com/nanpure/#')).toBe(true);
    expect(parseShare(url.slice(url.indexOf('#')))).toEqual({ seed: 42, difficulty: 'medium' });
  });
});
