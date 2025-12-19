/**
 * クリア成績の集計。難易度ごとの最短時間・クリア数と、ノーミスで解いた連続回数を持つ。
 * DOMにもlocalStorageにも依存しない純データ層なので、勝利1回ぶんの更新規則を素直にテストできる。
 * 表示やズルを防ぐ判定はここではせず、Gameが報告したクリア結果をそのまま積む。
 */

import { DIFFICULTIES, type Difficulty } from './lib';

export interface DifficultyRecord {
  /** その難易度でクリアした回数。 */
  readonly solved: number;
  /** 最短クリア時間(ミリ秒)。未クリアなら null。 */
  readonly bestMs: number | null;
  /** ノーミスでの最短クリア時間。一度もなければ null。 */
  readonly bestFlawlessMs: number | null;
}

export interface Stats {
  readonly byDifficulty: Record<Difficulty, DifficultyRecord>;
  /** 全難易度を合わせたクリア総数。 */
  readonly totalSolved: number;
  /** 直近で連続してノーミスクリアした回数。ミスありのクリアで途切れる。 */
  readonly flawlessStreak: number;
}

export interface WinInput {
  readonly difficulty: Difficulty;
  readonly elapsedMs: number;
  readonly mistakes: number;
}

export interface WinOutcome {
  readonly stats: Stats;
  /** その難易度の最短時間を更新したか。 */
  readonly newBest: boolean;
  /** ノーミスでのクリアだったか。 */
  readonly flawless: boolean;
  /** ノーミス最短を更新したか。 */
  readonly newFlawlessBest: boolean;
}

function emptyRecord(): DifficultyRecord {
  return { solved: 0, bestMs: null, bestFlawlessMs: null };
}

export function emptyStats(): Stats {
  const byDifficulty = {} as Record<Difficulty, DifficultyRecord>;
  for (const d of DIFFICULTIES) byDifficulty[d] = emptyRecord();
  return { byDifficulty, totalSolved: 0, flawlessStreak: 0 };
}

function lower(prev: number | null, next: number): { value: number; improved: boolean } {
  if (prev === null || next < prev) return { value: next, improved: true };
  return { value: prev, improved: false };
}

/** 1局クリアした結果を反映した新しい Stats と、自己ベスト更新などの判定を返す。 */
export function recordWin(stats: Stats, input: WinInput): WinOutcome {
  const flawless = input.mistakes === 0;
  const prev = stats.byDifficulty[input.difficulty];
  const best = lower(prev.bestMs, input.elapsedMs);
  const flawlessBest = flawless
    ? lower(prev.bestFlawlessMs, input.elapsedMs)
    : { value: prev.bestFlawlessMs as number, improved: false };

  const record: DifficultyRecord = {
    solved: prev.solved + 1,
    bestMs: best.value,
    bestFlawlessMs: flawless ? flawlessBest.value : prev.bestFlawlessMs,
  };

  return {
    stats: {
      byDifficulty: { ...stats.byDifficulty, [input.difficulty]: record },
      totalSolved: stats.totalSolved + 1,
      flawlessStreak: flawless ? stats.flawlessStreak + 1 : 0,
    },
    newBest: best.improved,
    flawless,
    newFlawlessBest: flawless && flawlessBest.improved,
  };
}

/** 保存値や旧バージョンの欠けたフィールドを補い、必ず妥当な Stats にする。 */
export function normalizeStats(raw: unknown): Stats {
  const base = emptyStats();
  if (typeof raw !== 'object' || raw === null) return base;
  const data = raw as Partial<Stats>;
  const byDifficulty = {} as Record<Difficulty, DifficultyRecord>;
  for (const d of DIFFICULTIES) {
    const r = data.byDifficulty?.[d];
    byDifficulty[d] = {
      solved: numberOr(r?.solved, 0),
      bestMs: positiveOrNull(r?.bestMs),
      bestFlawlessMs: positiveOrNull(r?.bestFlawlessMs),
    };
  }
  const totalSolved =
    numberOr(data.totalSolved, 0) ||
    DIFFICULTIES.reduce((sum, d) => sum + byDifficulty[d].solved, 0);
  return {
    byDifficulty,
    totalSolved,
    flawlessStreak: numberOr(data.flawlessStreak, 0),
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
