import { describe, expect, it } from 'vitest';
import { CELLS, isSolved, serializeGrid } from './board';
import { hasUniqueSolution, solve } from './solver';
import { rateDifficulty } from './difficulty';
import { generate } from './generator';

describe('generate', () => {
  it('生成した問題は一意解を持ち、報告どおりの解になる', () => {
    const p = generate({ difficulty: 'easy', seed: 12345, maxAttempts: 30 });
    expect(hasUniqueSolution(p.puzzle)).toBe(true);
    expect(isSolved(p.solution)).toBe(true);
    expect(serializeGrid(solve(p.puzzle)!)).toBe(serializeGrid(p.solution));
  });

  it('初期盤面は解の部分集合', () => {
    const p = generate({ difficulty: 'medium', seed: 777, maxAttempts: 30 });
    for (let i = 0; i < CELLS; i++) {
      if (p.puzzle[i] !== 0) expect(p.puzzle[i]).toBe(p.solution[i]);
    }
    expect(p.clues).toBeGreaterThanOrEqual(17);
    expect(p.clues).toBeLessThan(CELLS);
  });

  it('報告された難易度は判定と一致する', () => {
    const p = generate({ difficulty: 'easy', seed: 2024, maxAttempts: 30 });
    expect(rateDifficulty(p.puzzle).level).toBe(p.difficulty);
  });

  it('やさしい指定はやさしい問題を返す', () => {
    const p = generate({ difficulty: 'easy', seed: 555, maxAttempts: 30 });
    expect(p.difficulty).toBe('easy');
    expect(p.rating.solvedLogically).toBe(true);
  });

  it('対称指定では空きマスが180度回転対称になる', () => {
    const p = generate({ difficulty: 'medium', seed: 90909, symmetric: true, maxAttempts: 30 });
    for (let cell = 0; cell < CELLS; cell++) {
      const partner = CELLS - 1 - cell;
      expect(p.puzzle[cell] === 0).toBe(p.puzzle[partner] === 0);
    }
  });

  it('同じシードからは同じ問題が再現される', () => {
    const a = generate({ difficulty: 'medium', seed: 314159, maxAttempts: 30 });
    const b = generate({ difficulty: 'medium', seed: 314159, maxAttempts: 30 });
    expect(serializeGrid(a.puzzle)).toBe(serializeGrid(b.puzzle));
  });
});
