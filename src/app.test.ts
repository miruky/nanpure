// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bit, parseGrid } from './lib';
import { Game, type GameData } from './game';
import { createBoard, type BoardView } from './ui/board';
import { createControls, type ControlHandlers } from './ui/controls';
import { icon } from './ui/icons';
import { mountApp } from './app';

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

function viewOf(game: Game): BoardView {
  return {
    values: game.values,
    given: game.given,
    pencils: game.pencils,
    selected: game.selected,
    conflicts: game.conflicts(),
    highlight: true,
    hintCells: new Set<number>(),
  };
}

function noopHandlers(over: Partial<ControlHandlers> = {}): ControlHandlers {
  return {
    onDigit() {},
    onErase() {},
    onUndo() {},
    onRedo() {},
    onTogglePencil() {},
    onFillPencils() {},
    onHint() {},
    ...over,
  };
}

beforeEach(() => {
  try {
    localStorage.removeItem('nanpure:game');
    localStorage.removeItem('nanpure:settings');
  } catch {
    // happy-dom の実装差は無視してよい(storage 層が握りつぶす)
  }
  document.body.innerHTML = '';
  location.hash = '';
});

describe('icon', () => {
  it('currentColor の最適化されたSVGを返す', () => {
    const svg = icon('refresh');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('aria-hidden="true"');
  });
});

describe('createBoard', () => {
  it('81マスを描画し、確定値とメモを反映する', () => {
    const game = newGame();
    const cell = game.given.findIndex((g) => !g);
    game.pencils[cell] = bit(2) | bit(7);
    const board = createBoard(() => {});
    document.body.append(board.el);
    board.render(viewOf(game));

    expect(board.el.querySelectorAll('.cell-bg').length).toBe(81);
    const values = board.el.querySelectorAll('.cell-value');
    expect(values.length).toBe(81);
    expect(values[0]!.textContent).toBe('5');
    expect(values[0]!.getAttribute('class')).toContain('is-given');

    const onMarks = board.el.querySelectorAll('.pencil-mark.is-on');
    expect(onMarks.length).toBe(2);
  });

  it('クリックした位置のマスを選択する', () => {
    let picked = -1;
    const board = createBoard((c) => (picked = c));
    board.el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 450, height: 450, right: 450, bottom: 450, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.append(board.el);
    board.el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 25, clientY: 25, bubbles: true }));
    expect(picked).toBe(0);
  });
});

describe('createControls', () => {
  it('数字ボタンで入力ハンドラを呼ぶ', () => {
    let entered = -1;
    const controls = createControls(noopHandlers({ onDigit: (d) => (entered = d) }));
    document.body.append(controls.el);
    const nums = controls.el.querySelectorAll<HTMLButtonElement>('.num');
    expect(nums.length).toBe(9);
    nums[4]!.click();
    expect(entered).toBe(5);
  });

  it('残り0の数字は無効化される', () => {
    const controls = createControls(noopHandlers());
    controls.update({
      remaining: [0, 0, 9, 9, 9, 9, 9, 9, 9, 9],
      pencilMode: false,
      canUndo: true,
      canRedo: false,
    });
    const nums = controls.el.querySelectorAll<HTMLButtonElement>('.num');
    expect(nums[0]!.disabled).toBe(true);
    expect(nums[1]!.disabled).toBe(false);
  });

  it('メモモードを見た目に反映する', () => {
    const controls = createControls(noopHandlers());
    controls.update({ remaining: new Array(10).fill(9), pencilMode: true, canUndo: false, canRedo: false });
    const pencil = controls.el.querySelector('.action.is-active');
    expect(pencil).not.toBeNull();
    expect(pencil!.getAttribute('aria-pressed')).toBe('true');
  });

  it('自動メモボタンが候補一括メモのハンドラを呼ぶ', () => {
    let filled = 0;
    const controls = createControls(noopHandlers({ onFillPencils: () => (filled += 1) }));
    const actions = controls.el.querySelectorAll<HTMLButtonElement>('.toolbar .action');
    expect(actions.length).toBe(6);
    const fill = [...actions].find((b) => b.textContent?.includes('自動メモ'));
    expect(fill).toBeDefined();
    fill!.click();
    expect(filled).toBe(1);
  });
});

describe('createBoard 配置アニメ', () => {
  it('新しく置いた数字のときだけ is-placed を付ける', () => {
    const game = newGame();
    const board = createBoard(() => {});
    document.body.append(board.el);
    board.render(viewOf(game));
    // 空きマスへ数字を入れて再描画すると、そのマスだけ is-placed が付く
    const cell = game.given.findIndex((g) => !g);
    game.select(cell);
    game.enter(game.solution[cell]!);
    board.render(viewOf(game));
    const placed = board.el.querySelectorAll('.cell-value.is-placed');
    expect(placed.length).toBe(1);
    // 値が変わらない再描画では is-placed は消える(アニメは一度きり)
    board.render(viewOf(game));
    expect(board.el.querySelectorAll('.cell-value.is-placed').length).toBe(0);
  });
});

describe('mountApp', () => {
  it('保存も共有もなければ難易度メニューから始まる', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    document.body.append(root);
    mountApp(root);
    expect(root.querySelector('.brand h1')?.textContent).toBe('ナンプレ');
    expect(document.querySelectorAll('.difficulty-item').length).toBe(4);
    vi.useRealTimers();
  });
});
