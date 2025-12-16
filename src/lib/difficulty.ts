/**
 * 問題の難易度判定。
 *
 * 「解くのに最後まで必要だったテクニックの難しさ」で測る。やさしいテクニックだけで
 * 解ければ易しく、推測なしでは進めない盤面はエキスパートとする。乱数の試行回数や
 * 空きマス数で測る方式と違い、人が実際に感じる難しさに近い指標になる。
 */

import type { Grid } from './board';
import { solveLogically, type TechniqueName } from './techniques';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'やさしい',
  medium: 'ふつう',
  hard: 'むずかしい',
  expert: 'エキスパート',
};

/** 各テクニックが属する難易度の段階。 */
const TIER: Record<TechniqueName, Exclude<Difficulty, 'expert'>> = {
  'naked-single': 'easy',
  'hidden-single': 'easy',
  'locked-pointing': 'medium',
  'locked-claiming': 'medium',
  'naked-pair': 'hard',
  'hidden-pair': 'hard',
  'naked-triple': 'hard',
  'hidden-triple': 'hard',
};

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 };

export interface Rating {
  readonly level: Difficulty;
  /** 論理だけで解けたか(false なら推測が必要=エキスパート)。 */
  readonly solvedLogically: boolean;
  /** 解く過程で使われたテクニックの集合。 */
  readonly techniquesUsed: readonly TechniqueName[];
  /** 論理ステップ数。同じ段階内での体感の重さの目安。 */
  readonly steps: number;
}

export function rateDifficulty(grid: Grid): Rating {
  const result = solveLogically(grid);
  const used = new Set<TechniqueName>();
  for (const step of result.steps) used.add(step.technique);

  let level: Difficulty = 'easy';
  if (!result.solved) {
    level = 'expert';
  } else {
    for (const t of used) {
      if (RANK[TIER[t]] > RANK[level]) level = TIER[t];
    }
  }

  return {
    level,
    solvedLogically: result.solved,
    techniquesUsed: [...used],
    steps: result.steps.length,
  };
}
