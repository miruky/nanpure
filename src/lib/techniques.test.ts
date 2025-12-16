import { describe, expect, it } from 'vitest';
import { ALL, bit, candidates, CELLS, cloneGrid, parseGrid } from './board';
import {
  applyStep,
  cellLabel,
  nextStep,
  solveLogically,
  type Step,
  type TechniqueName,
  TECHNIQUES,
} from './techniques';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function byName(name: TechniqueName) {
  const def = TECHNIQUES.find((t) => t.name === name);
  if (!def) throw new Error(`未知のテクニック: ${name}`);
  return def.run;
}

describe('ネイキッド・シングル', () => {
  it('候補が1つに絞れたセルを確定する', () => {
    const grid = parseGrid(SOLUTION);
    const expected = grid[0]!;
    grid[0] = 0;
    const step = nextStep(grid, candidates(grid));
    expect(step?.technique).toBe('naked-single');
    expect(step?.placements).toEqual([{ cell: 0, digit: expected }]);
  });
});

describe('ヒドゥン・シングル', () => {
  it('ユニット内で唯一置ける場所へ確定する', () => {
    const cand = new Uint16Array(CELLS);
    // 1行目: 7はセル0にしか入れない。セル0自身は候補2つ(3と7)を持つ。
    cand[0] = bit(3) | bit(7);
    for (let c = 1; c < 9; c++) cand[c] = bit(3) | bit(4);
    const step = byName('hidden-single')([], cand);
    expect(step?.technique).toBe('hidden-single');
    expect(step?.placements).toEqual([{ cell: 0, digit: 7 }]);
  });
});

describe('ロックド候補(ポインティング)', () => {
  it('ブロック内で1行に偏った候補を、その行の外から消す', () => {
    const cand = new Uint16Array(CELLS);
    // ブロック0の5は1行目(セル0,1,2)に限られる
    for (const c of [0, 1, 2]) cand[c] = bit(5) | bit(6);
    for (const c of [9, 10, 11, 18, 19, 20]) cand[c] = bit(6) | bit(8);
    cand[3] = bit(5) | bit(7); // 同じ行のブロック外。ここから5が消えるはず
    const step = byName('locked-pointing')([], cand);
    expect(step?.technique).toBe('locked-pointing');
    expect(step?.eliminations).toContainEqual({ cell: 3, digit: 5 });
  });
});

describe('ネイキッド・ペア', () => {
  it('同じ2候補を持つ2マスから、他マスのその候補を消す', () => {
    const cand = new Uint16Array(CELLS);
    cand[0] = bit(1) | bit(2);
    cand[1] = bit(1) | bit(2);
    cand[2] = bit(1) | bit(2) | bit(3);
    const step = byName('naked-pair')([], cand);
    expect(step?.technique).toBe('naked-pair');
    expect(step?.eliminations).toContainEqual({ cell: 2, digit: 1 });
    expect(step?.eliminations).toContainEqual({ cell: 2, digit: 2 });
    expect(step?.eliminations).not.toContainEqual({ cell: 2, digit: 3 });
  });
});

describe('applyStep', () => {
  it('確定を盤面と候補へ反映し、ピアから数字を消す', () => {
    const grid = parseGrid(SOLUTION);
    grid[0] = 0;
    const cand = candidates(grid);
    const digit = parseGrid(SOLUTION)[0]!;
    const step: Step = {
      technique: 'naked-single',
      placements: [{ cell: 0, digit }],
      eliminations: [],
      reason: [0],
      explain: '',
    };
    applyStep(grid, cand, step);
    expect(grid[0]).toBe(digit);
    expect(cand[0]).toBe(0);
    for (const peer of [1, 9]) expect(cand[peer]! & bit(digit)).toBe(0);
  });

  it('候補除去を反映する', () => {
    const cand = new Uint16Array(CELLS).fill(ALL);
    const step: Step = {
      technique: 'naked-pair',
      placements: [],
      eliminations: [{ cell: 5, digit: 4 }],
      reason: [],
      explain: '',
    };
    applyStep(cloneGrid([]), cand, step);
    expect(cand[5]! & bit(4)).toBe(0);
  });
});

describe('solveLogically', () => {
  it('やさしい問題を論理だけで最後まで解く', () => {
    const result = solveLogically(parseGrid(PUZZLE));
    expect(result.solved).toBe(true);
    expect(result.grid).toEqual(parseGrid(SOLUTION));
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('完成済みの盤面では次の手がない', () => {
    expect(nextStep(parseGrid(SOLUTION), candidates(parseGrid(SOLUTION)))).toBeNull();
  });
});

describe('cellLabel', () => {
  it('1始まりの行列で表す', () => {
    expect(cellLabel(0)).toBe('1行1列');
    expect(cellLabel(80)).toBe('9行9列');
  });
});
