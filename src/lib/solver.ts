/**
 * 制約伝播つきバックトラッキング・ソルバー。
 *
 * 各セルの取りうる数字を9ビットのマスクで持ち、確定のたびに2種類の伝播を回す。
 *   (1) あるセルが1候補に減ったら、その数字をピア全体から消す。
 *   (2) あるユニット内で、ある数字を置ける場所が1つになったら、そこへ確定する。
 * 伝播だけで矛盾が出れば即座に枝を捨てられる。伝播が止まったら、候補が最も少ない
 * セル(MRV ヒューリスティック)を選んで分岐する。探索木が浅くなり高速に解ける。
 *
 * 解の数え上げは上限付きで打ち切る。生成器は「解がちょうど1つ」を確かめたいだけなので
 * 2つ目が見つかった時点で止めればよく、全解を列挙する必要はない。
 */

import {
  ALL,
  bit,
  CELLS,
  digitsOf,
  type Grid,
  emptyGrid,
  PEERS,
  popcount,
  soleDigit,
  UNITS,
  UNITS_OF,
} from './board';
import type { Rng } from './rng';

type Values = Uint16Array;

/** grid の確定値を割り当てた候補マスク列を作る。矛盾していれば null。 */
function fromGrid(grid: Grid): Values | null {
  const values = new Uint16Array(CELLS).fill(ALL);
  for (let cell = 0; cell < CELLS; cell++) {
    const d = grid[cell]!;
    if (d !== 0 && !assign(values, cell, d)) return null;
  }
  return values;
}

function toGrid(values: Values): Grid {
  const grid = emptyGrid();
  for (let cell = 0; cell < CELLS; cell++) grid[cell] = soleDigit(values[cell]!);
  return grid;
}

/** cell を数字 d に確定する(d 以外の候補を順に消す)。矛盾すれば false。 */
function assign(values: Values, cell: number, d: number): boolean {
  const others = values[cell]! & ~bit(d);
  for (const od of digitsOf(others)) {
    if (!eliminate(values, cell, od)) return false;
  }
  return true;
}

/** cell から数字 d を候補として除く。除去に伴う伝播も行う。矛盾すれば false。 */
function eliminate(values: Values, cell: number, d: number): boolean {
  const b = bit(d);
  if ((values[cell]! & b) === 0) return true;
  values[cell]! &= ~b;

  const remaining = values[cell]!;
  if (remaining === 0) return false; // 候補が尽きた

  // (1) 1候補に減ったら、その数字をピアから消す
  if (popcount(remaining) === 1) {
    const only = soleDigit(remaining);
    for (const peer of PEERS[cell]!) {
      if (!eliminate(values, peer, only)) return false;
    }
  }
  // (2) d を置けるセルがユニット内で1つだけになったら、そこへ確定する
  for (const ui of UNITS_OF[cell]!) {
    let count = 0;
    let spot = -1;
    for (const u of UNITS[ui]!) {
      if (values[u]! & b) {
        count++;
        spot = u;
      }
    }
    if (count === 0) return false;
    if (count === 1 && !assign(values, spot, d)) return false;
  }
  return true;
}

function search(values: Values, limit: number, rng: Rng | undefined, out: Grid[]): void {
  if (out.length >= limit) return;

  // 候補数が最小(2以上)のセルを選ぶ。すべて1候補なら解が確定。
  let target = -1;
  let best = 10;
  for (let cell = 0; cell < CELLS; cell++) {
    const c = popcount(values[cell]!);
    if (c > 1 && c < best) {
      best = c;
      target = cell;
    }
  }
  if (target === -1) {
    out.push(toGrid(values));
    return;
  }

  const order = digitsOf(values[target]!);
  if (rng) rng.shuffle(order);
  for (const d of order) {
    if (out.length >= limit) return;
    const copy = values.slice();
    if (assign(copy, target, d)) search(copy, limit, rng, out);
  }
}

export interface SolveOptions {
  /** 与えると分岐の数字順をシャッフルする。完成盤面をランダムに作るのに使う。 */
  rng?: Rng;
}

/** 解を1つ返す。解けなければ null。rng を渡すと解の選び方がランダムになる。 */
export function solve(grid: Grid, options: SolveOptions = {}): Grid | null {
  const values = fromGrid(grid);
  if (!values) return null;
  const out: Grid[] = [];
  search(values, 1, options.rng, out);
  return out[0] ?? null;
}

/** 解の個数を limit まで数える(既定2)。一意性判定に使う。 */
export function countSolutions(grid: Grid, limit = 2): number {
  const values = fromGrid(grid);
  if (!values) return 0;
  const out: Grid[] = [];
  search(values, limit, undefined, out);
  return out.length;
}

/** 解がちょうど1つか。 */
export function hasUniqueSolution(grid: Grid): boolean {
  return countSolutions(grid, 2) === 1;
}
