import { beforeEach, describe, expect, it } from 'vitest';
import { parseGrid } from './lib';
import { Game, type GameData } from './game';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function newGame(): Game {
  const data: GameData = {
    puzzle: parseGrid(PUZZLE),
    solution: parseGrid(SOLUTION),
    difficulty: 'easy',
    seed: 0,
  };
  return new Game(data);
}

// 最初の空きマス(初期ヒントでないマス)。
function firstEmpty(game: Game): number {
  return game.values.findIndex((_, i) => !game.given[i]);
}

describe('Game の入力', () => {
  let game: Game;
  beforeEach(() => {
    game = newGame();
  });

  it('初期ヒントは given として保持される', () => {
    expect(game.given[0]).toBe(true); // 5
    expect(game.given[2]).toBe(false); // 空き
    expect(game.values[0]).toBe(5);
  });

  it('空きマスへ数字を入力できる', () => {
    const cell = firstEmpty(game);
    game.select(cell);
    game.enter(game.solution[cell]!);
    expect(game.values[cell]).toBe(game.solution[cell]);
  });

  it('解と違う数字を置くとミスが増える', () => {
    const cell = firstEmpty(game);
    const wrong = game.solution[cell] === 1 ? 2 : 1;
    game.select(cell);
    game.enter(wrong);
    expect(game.mistakes).toBe(1);
    game.enter(game.solution[cell]!);
    expect(game.mistakes).toBe(1); // 正解では増えない
  });

  it('初期ヒントのマスは変更できない', () => {
    game.select(0);
    game.enter(1);
    expect(game.values[0]).toBe(5);
  });

  it('同じ数字をもう一度入れると消える', () => {
    const cell = firstEmpty(game);
    game.select(cell);
    game.enter(7);
    game.enter(7);
    expect(game.values[cell]).toBe(0);
  });
});

describe('メモ', () => {
  it('メモモードでは候補を反転し、確定入力でメモは消える', () => {
    const game = newGame();
    const cell = firstEmpty(game);
    game.select(cell);
    game.setPencilMode(true);
    game.enter(3);
    game.enter(5);
    expect(game.pencils[cell]).toBe(0b10100); // bit3 と bit5
    game.setPencilMode(false);
    game.enter(game.solution[cell]!);
    expect(game.pencils[cell]).toBe(0);
  });

  it('fillPencils で全空きマスに候補を入れる', () => {
    const game = newGame();
    game.fillPencils();
    const cell = firstEmpty(game);
    expect(game.pencils[cell]).toBeGreaterThan(0);
  });
});

describe('取り消しとやり直し', () => {
  it('undo/redo で入力を行き来できる', () => {
    const game = newGame();
    const cell = firstEmpty(game);
    game.select(cell);
    game.enter(7);
    expect(game.values[cell]).toBe(7);
    game.undo();
    expect(game.values[cell]).toBe(0);
    expect(game.canRedo).toBe(true);
    game.redo();
    expect(game.values[cell]).toBe(7);
  });

  it('履歴がなければ何もしない', () => {
    const game = newGame();
    expect(game.canUndo).toBe(false);
    game.undo();
    expect(game.values).toEqual(parseGrid(PUZZLE));
  });
});

describe('集計とヒント', () => {
  it('remaining は各数字の残りを数える', () => {
    const game = newGame();
    const counts = game.remaining();
    // 解の各数字はちょうど9個。初期ヒントの分だけ残りが減っている。
    expect(counts[5]).toBeLessThan(9);
    expect(counts.slice(1).every((c) => c >= 0)).toBe(true);
  });

  it('hint は次の論理手を返す', () => {
    const game = newGame();
    const step = game.hint();
    expect(step).not.toBeNull();
    expect(step!.placements.length + step!.eliminations.length).toBeGreaterThan(0);
  });
});

describe('クリアと勝利', () => {
  it('すべて正しく埋めると solved になる', () => {
    const game = newGame();
    for (let cell = 0; cell < 81; cell++) {
      if (game.given[cell]) continue;
      game.select(cell);
      game.enter(game.solution[cell]!);
    }
    expect(game.isSolved).toBe(true);
    expect(game.mistakes).toBe(0);
    expect(game.remainingCells).toBe(0);
  });
});

describe('直列化', () => {
  it('toJSON と fromJSON は状態を保つ', () => {
    const game = newGame();
    const cell = firstEmpty(game);
    game.select(cell);
    game.enter(7);
    game.elapsedMs = 12345;
    const restored = Game.fromJSON(game.toJSON());
    expect(restored.values).toEqual(game.values);
    expect(restored.difficulty).toBe('easy');
    expect(restored.elapsedMs).toBe(12345);
    expect(restored.given[0]).toBe(true);
  });
});
