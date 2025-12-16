import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from './rng';

describe('createRng', () => {
  it('同じシードからは同じ列が出る', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('違うシードでは違う列が出る', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next は [0,1) に収まる', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int は [0,n) の整数を返す', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('shuffle は要素を失わない並べ替え', () => {
    const rng = createRng(123);
    const original = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = rng.shuffle(original.slice());
    expect(shuffled).toHaveLength(50);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(original);
  });
});

describe('hashSeed', () => {
  it('同じ文字列からは同じ値、違えば(ほぼ)違う値', () => {
    expect(hashSeed('nanpure')).toBe(hashSeed('nanpure'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });

  it('符号なし32bitに収まる', () => {
    const h = hashSeed('数独');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});
