import { describe, expect, it } from 'vitest';
import { emptyStats, normalizeStats, recordWin } from './stats';

describe('recordWin', () => {
  it('初回クリアは最短時間とクリア数を立てる', () => {
    const r = recordWin(emptyStats(), { difficulty: 'easy', elapsedMs: 90_000, mistakes: 0 });
    expect(r.newBest).toBe(true);
    expect(r.flawless).toBe(true);
    expect(r.newFlawlessBest).toBe(true);
    expect(r.stats.byDifficulty.easy.solved).toBe(1);
    expect(r.stats.byDifficulty.easy.bestMs).toBe(90_000);
    expect(r.stats.totalSolved).toBe(1);
  });

  it('遅いクリアは最短時間を更新しないがクリア数は増える', () => {
    const first = recordWin(emptyStats(), { difficulty: 'easy', elapsedMs: 60_000, mistakes: 0 });
    const second = recordWin(first.stats, { difficulty: 'easy', elapsedMs: 80_000, mistakes: 0 });
    expect(second.newBest).toBe(false);
    expect(second.stats.byDifficulty.easy.bestMs).toBe(60_000);
    expect(second.stats.byDifficulty.easy.solved).toBe(2);
  });

  it('ミスありクリアはノーミス連勝をリセットし、ノーミス最短を更新しない', () => {
    const a = recordWin(emptyStats(), { difficulty: 'hard', elapsedMs: 120_000, mistakes: 0 });
    expect(a.stats.flawlessStreak).toBe(1);
    const b = recordWin(a.stats, { difficulty: 'hard', elapsedMs: 50_000, mistakes: 2 });
    expect(b.flawless).toBe(false);
    expect(b.newFlawlessBest).toBe(false);
    expect(b.stats.flawlessStreak).toBe(0);
    // ミスありなので、より速くてもノーミス最短は据え置き
    expect(b.stats.byDifficulty.hard.bestFlawlessMs).toBe(120_000);
    // 通常の最短はミスの有無に関わらず更新する
    expect(b.stats.byDifficulty.hard.bestMs).toBe(50_000);
  });

  it('ノーミス連勝は連続したノーミスクリアで伸びる', () => {
    let s = emptyStats();
    for (let i = 0; i < 3; i++) {
      s = recordWin(s, { difficulty: 'medium', elapsedMs: 100_000, mistakes: 0 }).stats;
    }
    expect(s.flawlessStreak).toBe(3);
  });

  it('難易度ごとに独立して集計する', () => {
    const a = recordWin(emptyStats(), { difficulty: 'easy', elapsedMs: 30_000, mistakes: 0 });
    const b = recordWin(a.stats, { difficulty: 'expert', elapsedMs: 600_000, mistakes: 1 });
    expect(b.stats.byDifficulty.easy.solved).toBe(1);
    expect(b.stats.byDifficulty.expert.solved).toBe(1);
    expect(b.stats.byDifficulty.expert.bestFlawlessMs).toBeNull();
    expect(b.stats.totalSolved).toBe(2);
  });
});

describe('normalizeStats', () => {
  it('壊れた値は空の成績に正規化する', () => {
    expect(normalizeStats(null)).toEqual(emptyStats());
    expect(normalizeStats('nope')).toEqual(emptyStats());
    expect(normalizeStats(42)).toEqual(emptyStats());
  });

  it('欠けた難易度を補い、不正な最短時間を捨てる', () => {
    const s = normalizeStats({
      byDifficulty: { easy: { solved: 2, bestMs: -5, bestFlawlessMs: 1000 } },
      totalSolved: 2,
    });
    expect(s.byDifficulty.easy.solved).toBe(2);
    expect(s.byDifficulty.easy.bestMs).toBeNull();
    expect(s.byDifficulty.easy.bestFlawlessMs).toBe(1000);
    expect(s.byDifficulty.expert.solved).toBe(0);
    expect(s.flawlessStreak).toBe(0);
  });

  it('totalSolvedが無ければ難易度別から合算する', () => {
    const s = normalizeStats({
      byDifficulty: {
        easy: { solved: 3, bestMs: 1, bestFlawlessMs: null },
        hard: { solved: 2, bestMs: 2, bestFlawlessMs: null },
      },
    });
    expect(s.totalSolved).toBe(5);
  });
});
