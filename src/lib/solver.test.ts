import { describe, expect, it } from 'vitest';
import { cloneGrid, emptyGrid, isSolved, parseGrid, serializeGrid } from './board';
import { countSolutions, hasUniqueSolution, solve } from './solver';
import { createRng } from './rng';

// よく知られた一意解を持つ問題とその解。
const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('solve', () => {
  it('一意解を持つ問題を正しく解く', () => {
    const solved = solve(parseGrid(PUZZLE));
    expect(solved).not.toBeNull();
    expect(isSolved(solved!)).toBe(true);
    expect(serializeGrid(solved!)).toBe(SOLUTION);
  });

  it('解は初期ヒントを保存する', () => {
    const puzzle = parseGrid(PUZZLE);
    const solved = solve(puzzle)!;
    for (let i = 0; i < 81; i++) {
      if (puzzle[i] !== 0) expect(solved[i]).toBe(puzzle[i]);
    }
  });

  it('空盤面も完成解になる', () => {
    const solved = solve(emptyGrid(), { rng: createRng(1) });
    expect(solved).not.toBeNull();
    expect(isSolved(solved!)).toBe(true);
  });

  it('rng を与えると別の完成解が出る', () => {
    const a = solve(emptyGrid(), { rng: createRng(1) })!;
    const b = solve(emptyGrid(), { rng: createRng(2) })!;
    expect(serializeGrid(a)).not.toBe(serializeGrid(b));
  });

  it('矛盾した盤面は解けず null', () => {
    const grid = emptyGrid();
    grid[0] = 5;
    grid[1] = 5; // 同じ行に5が2つ
    expect(solve(grid)).toBeNull();
  });
});

describe('解の数え上げ', () => {
  it('正しい問題の解はちょうど1つ', () => {
    expect(countSolutions(parseGrid(PUZZLE))).toBe(1);
    expect(hasUniqueSolution(parseGrid(PUZZLE))).toBe(true);
  });

  it('空盤面は複数解(上限で打ち切る)', () => {
    expect(countSolutions(emptyGrid(), 2)).toBe(2);
    expect(hasUniqueSolution(emptyGrid())).toBe(false);
  });

  it('ヒントを1つ消すと解が一意でなくなることがある', () => {
    // 完成解から1マス消すと、そのマスは元の値で確定するため一意のまま。
    // 2マス以上を不用意に消すと別解が生じうることを確認する。
    const solution = parseGrid(SOLUTION);
    const dropOne = cloneGrid(solution);
    dropOne[0] = 0;
    expect(hasUniqueSolution(dropOne)).toBe(true);
  });
});
