/**
 * 人間が紙の上で使う論理的な解法テクニック群。
 *
 * ここが本アプリの中核で、2つの用途を1つの実装でまかなう。
 *   - ヒント機能: 盤面を見て「次に確定できる手」とその根拠を日本語で示す。
 *   - 難易度判定: どのテクニックまで使えば解けるかで問題の難しさを測る(difficulty.ts)。
 *
 * 各テクニックは候補マスク列を読み、適用できる最初の1手を Step として返す。やさしい
 * テクニックから順に試し、最初に「確定」または「候補の除去」を生む手を採用する。総当たりの
 * 推測は含めない。推測なしで進めなくなった盤面は最難(エキスパート)と判定される。
 */

import {
  bit,
  boxOf,
  candidates,
  CELLS,
  cloneGrid,
  colOf,
  digitsOf,
  type Grid,
  isComplete,
  isConsistent,
  PEERS,
  popcount,
  rowOf,
  SIZE,
  soleDigit,
  UNITS,
} from './board';

export type TechniqueName =
  | 'naked-single'
  | 'hidden-single'
  | 'locked-pointing'
  | 'locked-claiming'
  | 'naked-pair'
  | 'naked-triple'
  | 'hidden-pair'
  | 'hidden-triple';

export interface Placement {
  readonly cell: number;
  readonly digit: number;
}

export interface Elimination {
  readonly cell: number;
  readonly digit: number;
}

export interface Step {
  readonly technique: TechniqueName;
  /** このステップで確定するセル。テクニックによっては空。 */
  readonly placements: readonly Placement[];
  /** このステップで取り除ける候補。 */
  readonly eliminations: readonly Elimination[];
  /** 根拠となったセル群(UIで強調する)。 */
  readonly reason: readonly number[];
  /** 人間向けの説明。 */
  readonly explain: string;
}

/** 1始まりの行・列でセルを表す(説明文用)。 */
export function cellLabel(cell: number): string {
  return `${rowOf(cell) + 1}行${colOf(cell) + 1}列`;
}

function unitLabel(unitIndex: number): string {
  if (unitIndex < SIZE) return `${unitIndex + 1}行`;
  if (unitIndex < SIZE * 2) return `${unitIndex - SIZE + 1}列`;
  return `ブロック${unitIndex - SIZE * 2 + 1}`;
}

type CandArray = Uint16Array;

/** ユニット内の空きセル(候補が残っているセル)。 */
function emptyCells(unit: readonly number[], cand: CandArray): number[] {
  return unit.filter((c) => cand[c] !== 0);
}

/** ある数字のビットだけが立ったマスクが、何個の数字を含むか。 */
function maskDigits(mask: number): number[] {
  return digitsOf(mask);
}

/** ネイキッド・シングル: 候補が1つだけのセルはその数字で確定する。 */
function nakedSingle(_grid: Grid, cand: CandArray): Step | null {
  for (let cell = 0; cell < CELLS; cell++) {
    const m = cand[cell]!;
    if (m !== 0 && popcount(m) === 1) {
      const digit = soleDigit(m);
      return {
        technique: 'naked-single',
        placements: [{ cell, digit }],
        eliminations: [],
        reason: [cell],
        explain: `${cellLabel(cell)} は候補が ${digit} だけなので確定する。`,
      };
    }
  }
  return null;
}

/** ヒドゥン・シングル: あるユニット内で、ある数字を置けるマスが1つしかない。 */
function hiddenSingle(_grid: Grid, cand: CandArray): Step | null {
  for (let ui = 0; ui < UNITS.length; ui++) {
    const unit = UNITS[ui]!;
    for (let d = 1; d <= SIZE; d++) {
      const b = bit(d);
      let count = 0;
      let spot = -1;
      for (const cell of unit) {
        if (cand[cell]! & b) {
          count++;
          spot = cell;
        }
      }
      if (count === 1 && popcount(cand[spot]!) > 1) {
        return {
          technique: 'hidden-single',
          placements: [{ cell: spot, digit: d }],
          eliminations: [],
          reason: unit.filter((c) => cand[c] !== 0),
          explain: `${unitLabel(ui)} で ${d} を置けるのは ${cellLabel(spot)} だけなので確定する。`,
        };
      }
    }
  }
  return null;
}

/**
 * ロックド候補(ポインティング): あるブロック内で、ある数字の候補が1つの行(列)に
 * 揃っているとき、その行(列)のブロック外からその数字を除ける。
 */
function lockedPointing(_grid: Grid, cand: CandArray): Step | null {
  for (let b = 0; b < SIZE; b++) {
    const box = UNITS[SIZE * 2 + b]!;
    for (let d = 1; d <= SIZE; d++) {
      const bm = bit(d);
      const spots = box.filter((c) => cand[c]! & bm);
      if (spots.length < 2) continue;
      const rows = new Set(spots.map(rowOf));
      const cols = new Set(spots.map(colOf));
      if (rows.size === 1) {
        const r = rows.values().next().value!;
        const elim = lineEliminations(cand, r, true, d, b);
        if (elim.length > 0) {
          return {
            technique: 'locked-pointing',
            placements: [],
            eliminations: elim,
            reason: spots,
            explain: `ブロック${b + 1} の ${d} は ${r + 1}行に限られるので、その行の他マスから ${d} を消す。`,
          };
        }
      }
      if (cols.size === 1) {
        const c = cols.values().next().value!;
        const elim = lineEliminations(cand, c, false, d, b);
        if (elim.length > 0) {
          return {
            technique: 'locked-pointing',
            placements: [],
            eliminations: elim,
            reason: spots,
            explain: `ブロック${b + 1} の ${d} は ${c + 1}列に限られるので、その列の他マスから ${d} を消す。`,
          };
        }
      }
    }
  }
  return null;
}

function lineEliminations(
  cand: CandArray,
  line: number,
  isRow: boolean,
  d: number,
  box: number,
): Elimination[] {
  const bm = bit(d);
  const out: Elimination[] = [];
  for (let i = 0; i < SIZE; i++) {
    const cell = isRow ? line * SIZE + i : i * SIZE + line;
    if (boxOf(cell) === box) continue;
    if (cand[cell]! & bm) out.push({ cell, digit: d });
  }
  return out;
}

/**
 * ロックド候補(クレーミング): ある行(列)で、ある数字の候補が1つのブロックに
 * 揃っているとき、そのブロックの行(列)外からその数字を除ける。
 */
function lockedClaiming(_grid: Grid, cand: CandArray): Step | null {
  for (let li = 0; li < SIZE * 2; li++) {
    const line = UNITS[li]!;
    const isRow = li < SIZE;
    for (let d = 1; d <= SIZE; d++) {
      const bm = bit(d);
      const spots = line.filter((c) => cand[c]! & bm);
      if (spots.length < 2) continue;
      const boxes = new Set(spots.map(boxOf));
      if (boxes.size !== 1) continue;
      const box = boxes.values().next().value!;
      const out: Elimination[] = [];
      for (const cell of UNITS[SIZE * 2 + box]!) {
        const onLine = isRow ? rowOf(cell) === li : colOf(cell) === li - SIZE;
        if (onLine) continue;
        if (cand[cell]! & bm) out.push({ cell, digit: d });
      }
      if (out.length > 0) {
        return {
          technique: 'locked-claiming',
          placements: [],
          eliminations: out,
          reason: spots,
          explain: `${unitLabel(li)} の ${d} はブロック${box + 1}に限られるので、そのブロックの他マスから ${d} を消す。`,
        };
      }
    }
  }
  return null;
}

/** ネイキッド・ペア/トリプル: n個のマスがちょうど同じn個の候補を共有する。 */
function nakedSubset(n: 2 | 3): (grid: Grid, cand: CandArray) => Step | null {
  return (_grid, cand) => {
    for (let ui = 0; ui < UNITS.length; ui++) {
      const unit = UNITS[ui]!;
      const cells = emptyCells(unit, cand).filter((c) => popcount(cand[c]!) <= n);
      const combos = combinations(cells, n);
      for (const group of combos) {
        let union = 0;
        for (const c of group) union |= cand[c]!;
        if (popcount(union) !== n) continue;
        const groupSet = new Set(group);
        const elim: Elimination[] = [];
        for (const cell of unit) {
          if (groupSet.has(cell) || cand[cell] === 0) continue;
          const shared = cand[cell]! & union;
          for (const d of maskDigits(shared)) elim.push({ cell, digit: d });
        }
        if (elim.length > 0) {
          const ds = maskDigits(union).join('・');
          return {
            technique: n === 2 ? 'naked-pair' : 'naked-triple',
            placements: [],
            eliminations: elim,
            reason: group,
            explain: `${unitLabel(ui)} の ${group.map(cellLabel).join('・')} が ${ds} だけを共有するので、同じユニットの他マスから ${ds} を消す。`,
          };
        }
      }
    }
    return null;
  };
}

/** ヒドゥン・ペア/トリプル: n個の数字が、ユニット内のちょうどn個のマスにしか入らない。 */
function hiddenSubset(n: 2 | 3): (grid: Grid, cand: CandArray) => Step | null {
  return (_grid, cand) => {
    for (let ui = 0; ui < UNITS.length; ui++) {
      const unit = UNITS[ui]!;
      const present: number[] = [];
      for (let d = 1; d <= SIZE; d++) {
        const bm = bit(d);
        if (unit.some((c) => cand[c]! & bm)) present.push(d);
      }
      for (const digits of combinations(present, n)) {
        let dmask = 0;
        for (const d of digits) dmask |= bit(d);
        const cells = unit.filter((c) => cand[c]! & dmask);
        if (cells.length !== n) continue;
        // n個の数字すべてが、その n マスの中に現れているか
        if (digits.some((d) => !cells.some((c) => cand[c]! & bit(d)))) continue;
        const elim: Elimination[] = [];
        for (const cell of cells) {
          const extra = cand[cell]! & ~dmask;
          for (const d of maskDigits(extra)) elim.push({ cell, digit: d });
        }
        if (elim.length > 0) {
          const ds = digits.join('・');
          return {
            technique: n === 2 ? 'hidden-pair' : 'hidden-triple',
            placements: [],
            eliminations: elim,
            reason: cells,
            explain: `${unitLabel(ui)} で ${ds} は ${cells.map(cellLabel).join('・')} にしか入らないので、その2〜3マスから他の候補を消す。`,
          };
        }
      }
    }
    return null;
  };
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const combo: T[] = [];
  const recurse = (start: number): void => {
    if (combo.length === k) {
      out.push(combo.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]!);
      recurse(i + 1);
      combo.pop();
    }
  };
  recurse(0);
  return out;
}

interface TechniqueDef {
  readonly name: TechniqueName;
  readonly run: (grid: Grid, cand: CandArray) => Step | null;
}

/** やさしい順。難易度判定はこの順序で「最後に必要になったテクニック」を見る。 */
export const TECHNIQUES: readonly TechniqueDef[] = [
  { name: 'naked-single', run: nakedSingle },
  { name: 'hidden-single', run: hiddenSingle },
  { name: 'locked-pointing', run: lockedPointing },
  { name: 'locked-claiming', run: lockedClaiming },
  { name: 'naked-pair', run: nakedSubset(2) },
  { name: 'hidden-pair', run: hiddenSubset(2) },
  { name: 'naked-triple', run: nakedSubset(3) },
  { name: 'hidden-triple', run: hiddenSubset(3) },
];

/** 現在の盤面・候補から、次に適用できる最もやさしいテクニックの1手を返す。 */
export function nextStep(grid: Grid, cand: CandArray): Step | null {
  for (const t of TECHNIQUES) {
    const step = t.run(grid, cand);
    if (step) return step;
  }
  return null;
}

/** Step を盤面と候補へ反映する(確定は盤面と候補の両方を更新する)。 */
export function applyStep(grid: Grid, cand: CandArray, step: Step): void {
  for (const e of step.eliminations) {
    cand[e.cell]! &= ~bit(e.digit);
  }
  for (const p of step.placements) {
    grid[p.cell] = p.digit;
    cand[p.cell] = 0;
    for (const peer of PEERS[p.cell]!) cand[peer]! &= ~bit(p.digit);
  }
}

export interface LogicalSolveResult {
  readonly solved: boolean;
  readonly steps: readonly Step[];
  readonly grid: Grid;
}

/**
 * テクニックだけで解けるところまで解く。推測はしない。
 * difficulty.ts はここで使われたテクニックの集合から難易度を決める。
 */
export function solveLogically(grid: Grid): LogicalSolveResult {
  const work = cloneGrid(grid);
  const cand = candidates(work);
  const steps: Step[] = [];
  for (;;) {
    if (isComplete(work)) break;
    const step = nextStep(work, cand);
    if (!step) break;
    applyStep(work, cand, step);
    steps.push(step);
  }
  return { solved: isComplete(work) && isConsistent(work), steps, grid: work };
}
