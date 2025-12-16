import { describe, expect, it } from 'vitest';
import {
  ALL,
  bit,
  boxOf,
  candidates,
  CELLS,
  colOf,
  conflicts,
  digitsOf,
  emptyGrid,
  isConsistent,
  isSolved,
  parseGrid,
  PEERS,
  popcount,
  rowOf,
  serializeGrid,
  soleDigit,
  UNITS,
  UNITS_OF,
} from './board';

const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('ビットマスク', () => {
  it('bit と digitsOf が対応する', () => {
    expect(bit(1)).toBe(1);
    expect(bit(9)).toBe(256);
    expect(digitsOf(ALL)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(digitsOf(bit(3) | bit(7))).toEqual([3, 7]);
  });

  it('popcount と soleDigit', () => {
    expect(popcount(ALL)).toBe(9);
    expect(popcount(0)).toBe(0);
    expect(soleDigit(bit(5))).toBe(5);
    expect(soleDigit(bit(1) | bit(2))).toBe(0);
    expect(soleDigit(0)).toBe(0);
  });
});

describe('ユニットとピア', () => {
  it('27ユニットがそれぞれ9セル', () => {
    expect(UNITS).toHaveLength(27);
    for (const unit of UNITS) expect(unit).toHaveLength(9);
  });

  it('各セルは3ユニットに属し、ピアは20個', () => {
    for (let cell = 0; cell < CELLS; cell++) {
      expect(UNITS_OF[cell]).toHaveLength(3);
      expect(PEERS[cell]).toHaveLength(20);
      expect(PEERS[cell]).not.toContain(cell);
    }
  });

  it('座標ヘルパ', () => {
    expect(rowOf(0)).toBe(0);
    expect(colOf(8)).toBe(8);
    expect(boxOf(0)).toBe(0);
    expect(boxOf(80)).toBe(8);
    expect(boxOf(40)).toBe(4);
  });
});

describe('候補', () => {
  it('空盤面では全セルが全数字を候補に持つ', () => {
    const cand = candidates(emptyGrid());
    for (let cell = 0; cell < CELLS; cell++) expect(cand[cell]).toBe(ALL);
  });

  it('確定セルは候補0、空きセルはピアの確定値を除いた候補を持つ', () => {
    const grid = emptyGrid();
    grid[0] = 5; // 左上を5に
    const cand = candidates(grid);
    expect(cand[0]).toBe(0);
    expect(cand[1]! & bit(5)).toBe(0); // 同じ行のセルから5が消える
    expect(cand[9]! & bit(5)).toBe(0); // 同じ列
  });
});

describe('整合性と競合', () => {
  it('完成解は整合し解けている', () => {
    const grid = parseGrid(SOLUTION);
    expect(isConsistent(grid)).toBe(true);
    expect(isSolved(grid)).toBe(true);
    expect(conflicts(grid).size).toBe(0);
  });

  it('同じ行に重複があると競合として検出する', () => {
    const grid = emptyGrid();
    grid[0] = 3;
    grid[1] = 3;
    expect(isConsistent(grid)).toBe(false);
    const bad = conflicts(grid);
    expect(bad.has(0)).toBe(true);
    expect(bad.has(1)).toBe(true);
  });
});

describe('文字列との相互変換', () => {
  it('parse と serialize は往復する', () => {
    const grid = parseGrid(SOLUTION);
    expect(serializeGrid(grid)).toBe(SOLUTION);
  });

  it('空きは . と 0 の両方を受け付ける', () => {
    const a = parseGrid('.'.repeat(81));
    const b = parseGrid('0'.repeat(81));
    expect(serializeGrid(a)).toBe(serializeGrid(b));
  });

  it('マス数が合わないと例外', () => {
    expect(() => parseGrid('123')).toThrow();
  });
});
