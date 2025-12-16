/**
 * 問題の生成。
 *
 * 手順は二段構え。まず空盤面をソルバーにランダムに解かせて完成盤面を1つ得る。次に
 * その完成盤面からヒントを少しずつ抜き、抜くたびに「解がただ1つ」であることを確かめる。
 * 一意性が崩れる抜き方は採用しない。見た目を整えるため既定では180度回転対称に2マスずつ抜く。
 *
 * 目標の難易度に寄せるため、抜いた後の盤面が目標より難しくなりそうなら抜くのをやめる
 * (やさしい問題が偶然の難問にならないようにする)。1回の試行で目標に届かなければシードを
 * 変えて作り直し、最も近いものを保険として残す。
 */

import { cloneGrid, CELLS, emptyGrid, type Grid } from './board';
import { type Difficulty, rateDifficulty, type Rating } from './difficulty';
import { createRng, type Rng } from './rng';
import { hasUniqueSolution, solve } from './solver';

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 };

export interface GenerateOptions {
  difficulty: Difficulty;
  /** 再現用のシード。省略時は乱数で決める。 */
  seed?: number;
  /** 180度回転対称に抜くか。既定 true。 */
  symmetric?: boolean;
  /** 目標難易度に届かないとき作り直す上限回数。 */
  maxAttempts?: number;
}

export interface Puzzle {
  /** 初期盤面(0が空き)。 */
  readonly puzzle: Grid;
  /** 唯一の解。 */
  readonly solution: Grid;
  readonly difficulty: Difficulty;
  readonly rating: Rating;
  /** 初期ヒント数。 */
  readonly clues: number;
  /** この問題を生んだシード(共有・再現に使う)。 */
  readonly seed: number;
}

function countClues(grid: Grid): number {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (grid[i] !== 0) n++;
  return n;
}

/** 完成盤面からヒントを抜いて問題にする。一意性と目標難易度の上限を守る。 */
function dig(solution: Grid, rng: Rng, target: Difficulty, symmetric: boolean): Grid {
  const puzzle = cloneGrid(solution);
  const order = rng.shuffle(Array.from({ length: CELLS }, (_, i) => i));
  const cap = RANK[target];

  for (const cell of order) {
    if (puzzle[cell] === 0) continue;
    const partner = CELLS - 1 - cell;
    const touched: number[] = [cell];
    if (symmetric && partner !== cell && puzzle[partner] !== 0) touched.push(partner);

    const saved = touched.map((c) => puzzle[c]!);
    for (const c of touched) puzzle[c] = 0;

    let ok = hasUniqueSolution(puzzle);
    // エキスパートは上限なしで限界まで抜く。それ以外は難しくなりすぎたら戻す。
    if (ok && target !== 'expert' && RANK[rateDifficulty(puzzle).level] > cap) ok = false;

    if (!ok) {
      touched.forEach((c, i) => (puzzle[c] = saved[i]!));
    }
  }
  return puzzle;
}

export function generate(options: GenerateOptions): Puzzle {
  const target = options.difficulty;
  const symmetric = options.symmetric ?? true;
  const maxAttempts = options.maxAttempts ?? 50;
  const baseSeed = (options.seed ?? Math.floor(Math.random() * 0x1_0000_0000)) >>> 0;

  let best: Puzzle | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = createRng((baseSeed + attempt * 0x9e3779b1) >>> 0);
    const solution = solve(emptyGrid(), { rng });
    if (!solution) continue; // 起こり得ないが型のため
    const puzzleGrid = dig(solution, rng, target, symmetric);
    const rating = rateDifficulty(puzzleGrid);
    const candidate: Puzzle = {
      puzzle: puzzleGrid,
      solution,
      difficulty: rating.level,
      rating,
      clues: countClues(puzzleGrid),
      seed: baseSeed,
    };
    if (rating.level === target) return candidate;
    const dist = Math.abs(RANK[rating.level] - RANK[target]);
    const bestDist = best ? Math.abs(RANK[best.difficulty] - RANK[target]) : Infinity;
    if (dist < bestDist) best = candidate;
  }
  // 目標ぴったりに届かなかった場合は最も近いものを返す
  return best!;
}

/** シードと難易度から再現生成する(共有URLの復元用)。 */
export function generateFromSeed(seed: number, difficulty: Difficulty): Puzzle {
  return generate({ seed, difficulty });
}
