/**
 * 9x9 数独盤面の基本モデル。
 *
 * 盤面はセル81個を行優先で並べた一次元配列で表す(index = row*9 + col)。値は
 * 0 が空き、1〜9 が確定値。行・列・3x3ブロックをまとめて「ユニット」と呼び、
 * 全27ユニットと各セルのピア(同一ユニットに属する他セル)はモジュール読込時に
 * 一度だけ計算して使い回す。探索・テクニック判定はこの固定テーブルの上で動く。
 *
 * 候補(あるセルに入りうる数字の集合)は9ビットのビットマスクで持つ。digit d は
 * ビット (d-1) に対応し、ALL=0x1FF が1〜9すべてを表す。集合演算をビット演算で
 * 行えるため、候補の絞り込みを多用するテクニック判定が軽くなる。
 */

export const SIZE = 9;
export const CELLS = 81;
export const BOX = 3;

/** 全数字 1〜9 を立てたマスク。 */
export const ALL = 0x1ff;

export type Grid = number[];

/** 数字 d (1〜9) のビットマスク。 */
export function bit(d: number): number {
  return 1 << (d - 1);
}

/** マスクに立っているビット数(候補数)。 */
export function popcount(mask: number): number {
  let n = 0;
  let m = mask;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** マスクに含まれる数字を昇順で返す。 */
export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= SIZE; d++) {
    if (mask & bit(d)) out.push(d);
  }
  return out;
}

/** マスクがちょうど1個のときその数字を、そうでなければ0を返す。 */
export function soleDigit(mask: number): number {
  if (mask === 0 || (mask & (mask - 1)) !== 0) return 0;
  return Math.log2(mask) + 1;
}

export const rowOf = (cell: number): number => Math.floor(cell / SIZE);
export const colOf = (cell: number): number => cell % SIZE;
export const boxOf = (cell: number): number =>
  Math.floor(rowOf(cell) / BOX) * BOX + Math.floor(colOf(cell) / BOX);

function buildUnits(): number[][] {
  const units: number[][] = [];
  for (let r = 0; r < SIZE; r++) {
    units.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  }
  for (let c = 0; c < SIZE; c++) {
    units.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  }
  for (let b = 0; b < SIZE; b++) {
    const r0 = Math.floor(b / BOX) * BOX;
    const c0 = (b % BOX) * BOX;
    const cells: number[] = [];
    for (let dr = 0; dr < BOX; dr++) {
      for (let dc = 0; dc < BOX; dc++) cells.push((r0 + dr) * SIZE + (c0 + dc));
    }
    units.push(cells);
  }
  return units;
}

/** 全27ユニット。0〜8が行、9〜17が列、18〜26がブロック。 */
export const UNITS: readonly (readonly number[])[] = buildUnits();

/** 各セルが属する3ユニットの添字(UNITSへの参照)。 */
export const UNITS_OF: readonly (readonly number[])[] = (() => {
  const out: number[][] = Array.from({ length: CELLS }, () => []);
  UNITS.forEach((unit, ui) => {
    for (const cell of unit) out[cell]!.push(ui);
  });
  return out;
})();

/** 各セルのピア(同じ行・列・ブロックの他セル)。1セルあたり20個。 */
export const PEERS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const set = new Set<number>();
    for (const ui of UNITS_OF[cell]!) {
      for (const peer of UNITS[ui]!) if (peer !== cell) set.add(peer);
    }
    out.push([...set].sort((a, b) => a - b));
  }
  return out;
})();

export function emptyGrid(): Grid {
  return new Array<number>(CELLS).fill(0);
}

export function cloneGrid(grid: Grid): Grid {
  return grid.slice();
}

/**
 * いま盤面に置かれている確定値だけから各セルの候補マスクを求める。
 * 確定済みセルは0を返す。テクニック判定はここから始める。
 */
export function candidates(grid: Grid): Uint16Array {
  const cand = new Uint16Array(CELLS);
  for (let cell = 0; cell < CELLS; cell++) {
    if (grid[cell] !== 0) continue;
    let mask = ALL;
    for (const peer of PEERS[cell]!) {
      const v = grid[peer]!;
      if (v !== 0) mask &= ~bit(v);
    }
    cand[cell] = mask;
  }
  return cand;
}

/** 確定値が同一ユニット内で重複していないか。空きは無視する。 */
export function isConsistent(grid: Grid): boolean {
  for (const unit of UNITS) {
    let seen = 0;
    for (const cell of unit) {
      const v = grid[cell]!;
      if (v === 0) continue;
      const b = bit(v);
      if (seen & b) return false;
      seen |= b;
    }
  }
  return true;
}

/** 数字の重複が起きているセルの集合(UI の競合ハイライト用)。 */
export function conflicts(grid: Grid): Set<number> {
  const bad = new Set<number>();
  for (const unit of UNITS) {
    const byDigit = new Map<number, number[]>();
    for (const cell of unit) {
      const v = grid[cell]!;
      if (v === 0) continue;
      const list = byDigit.get(v);
      if (list) list.push(cell);
      else byDigit.set(v, [cell]);
    }
    for (const list of byDigit.values()) {
      if (list.length > 1) for (const c of list) bad.add(c);
    }
  }
  return bad;
}

export function isComplete(grid: Grid): boolean {
  for (let cell = 0; cell < CELLS; cell++) if (grid[cell] === 0) return false;
  return true;
}

export function isSolved(grid: Grid): boolean {
  return isComplete(grid) && isConsistent(grid);
}

/**
 * 81文字の文字列と盤面を相互変換する。空きは '.' または '0'。
 * 盤面の保存・共有・テストの記述に使う。
 */
export function parseGrid(text: string): Grid {
  const grid = emptyGrid();
  let i = 0;
  for (const ch of text) {
    if (ch === '.' || ch === '0') {
      if (i < CELLS) grid[i++] = 0;
    } else if (ch >= '1' && ch <= '9') {
      if (i < CELLS) grid[i++] = ch.charCodeAt(0) - 48;
    }
    // それ以外(空白・改行など)は区切りとして読み飛ばす
  }
  if (i !== CELLS) throw new Error(`盤面は81マス必要です(読み取り ${i} マス)`);
  return grid;
}

export function serializeGrid(grid: Grid, empty = '.'): string {
  let out = '';
  for (let cell = 0; cell < CELLS; cell++) {
    out += grid[cell] === 0 ? empty : String(grid[cell]);
  }
  return out;
}
