/**
 * 1局分のゲーム状態。盤面の値・メモ・選択・ミス数・経過時間・取り消し履歴を持ち、
 * 入力を受けて状態を更新し、購読者へ変更を通知する。描画やDOMには依存しないので
 * そのまま単体テストできる。難易度判定・ヒント・自動メモはコアの数独エンジンに委ねる。
 */

import {
  bit,
  candidates,
  CELLS,
  cloneGrid,
  conflicts,
  type Difficulty,
  type Grid,
  isSolved,
  nextStep,
  PEERS,
  type Step,
} from './lib';

export interface GameData {
  /** 初期ヒント(0が空き)。ゲーム中は不変。 */
  readonly puzzle: Grid;
  readonly solution: Grid;
  readonly difficulty: Difficulty;
  readonly seed: number;
}

interface Snapshot {
  values: Grid;
  pencils: number[];
}

export interface SerializedGame {
  puzzle: string;
  solution: string;
  difficulty: Difficulty;
  seed: number;
  values: string;
  pencils: number[];
  mistakes: number;
  elapsedMs: number;
}

function serializeGridCompact(grid: Grid): string {
  return grid.map((v) => v).join(',');
}

function parseGridCompact(text: string): Grid {
  const grid = text.split(',').map((s) => Number(s));
  if (grid.length !== CELLS) throw new Error('盤面の長さが不正です');
  return grid;
}

export class Game {
  readonly puzzle: Grid;
  readonly solution: Grid;
  readonly given: readonly boolean[];
  readonly difficulty: Difficulty;
  readonly seed: number;

  values: Grid;
  pencils: number[];
  selected: number | null = null;
  pencilMode = false;
  mistakes = 0;
  elapsedMs = 0;
  status: 'playing' | 'solved' = 'playing';
  /** 数字を確定したとき、関係するマスのメモから自動でその数字を消すか。 */
  autoClean = false;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(data: GameData) {
    this.puzzle = cloneGrid(data.puzzle);
    this.solution = cloneGrid(data.solution);
    this.difficulty = data.difficulty;
    this.seed = data.seed;
    this.given = data.puzzle.map((v) => v !== 0);
    this.values = cloneGrid(data.puzzle);
    this.pencils = new Array<number>(CELLS).fill(0);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private snapshot(): Snapshot {
    return { values: cloneGrid(this.values), pencils: this.pencils.slice() };
  }

  private pushHistory(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack = [];
  }

  select(cell: number | null): void {
    this.selected = cell;
    this.emit();
  }

  setPencilMode(on: boolean): void {
    this.pencilMode = on;
    this.emit();
  }

  togglePencilMode(): void {
    this.setPencilMode(!this.pencilMode);
  }

  /** 選択中のセルへ数字を入力する。メモモードならメモを反転する。 */
  enter(digit: number): void {
    const cell = this.selected;
    if (cell === null || this.given[cell] || this.status === 'solved') return;
    if (this.pencilMode) {
      this.togglePencil(cell, digit);
      return;
    }
    if (this.values[cell] === digit) {
      this.clear(cell);
      return;
    }
    this.pushHistory();
    this.values[cell] = digit;
    this.pencils[cell] = 0;
    if (this.autoClean) {
      for (const peer of PEERS[cell]!) this.pencils[peer]! &= ~bit(digit);
    }
    if (this.solution[cell] !== digit) this.mistakes += 1;
    this.checkSolved();
    this.emit();
  }

  /** ヒントの一手(確定・候補除去)を盤面に反映する。論理的に正しいのでミスにはしない。 */
  applyHint(step: Step): void {
    this.pushHistory();
    for (const e of step.eliminations) this.pencils[e.cell]! &= ~bit(e.digit);
    for (const p of step.placements) {
      this.values[p.cell] = p.digit;
      this.pencils[p.cell] = 0;
      if (this.autoClean) {
        for (const peer of PEERS[p.cell]!) this.pencils[peer]! &= ~bit(p.digit);
      }
    }
    this.checkSolved();
    this.emit();
  }

  togglePencil(cell: number, digit: number): void {
    if (this.given[cell] || this.values[cell] !== 0) return;
    this.pushHistory();
    this.pencils[cell] = this.pencils[cell]! ^ bit(digit);
    this.emit();
  }

  /** 選択中のセル(または指定セル)の入力・メモを消す。 */
  clear(cell = this.selected ?? -1): void {
    if (cell < 0 || this.given[cell]) return;
    if (this.values[cell] === 0 && this.pencils[cell] === 0) return;
    this.pushHistory();
    this.values[cell] = 0;
    this.pencils[cell] = 0;
    this.status = 'playing';
    this.emit();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.values = prev.values;
    this.pencils = prev.pencils;
    this.status = 'playing';
    this.emit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.values = next.values;
    this.pencils = next.pencils;
    this.checkSolved();
    this.emit();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 全マスのメモを、現在の確定値から計算できる候補で置き換える。 */
  fillPencils(): void {
    this.pushHistory();
    const cand = candidates(this.values);
    for (let cell = 0; cell < CELLS; cell++) {
      this.pencils[cell] = this.values[cell] === 0 ? cand[cell]! : 0;
    }
    this.emit();
  }

  /** 数字ごとの残り個数(9個置けたら0)。数字パッドの表示に使う。 */
  remaining(): number[] {
    const counts = new Array<number>(10).fill(9);
    for (let cell = 0; cell < CELLS; cell++) {
      const v = this.values[cell]!;
      if (v !== 0) counts[v] = counts[v]! - 1;
    }
    return counts;
  }

  conflicts(): Set<number> {
    return conflicts(this.values);
  }

  /**
   * 次の一手をテクニックエンジンに尋ねる。現在プレイヤーが置いた値から候補を計算し、
   * 確定できるマスや消せる候補とその理由を返す。詰まったときの助けになる。
   */
  hint(): Step | null {
    return nextStep(this.values, candidates(this.values));
  }

  private checkSolved(): void {
    if (isSolved(this.values)) this.status = 'solved';
  }

  get isSolved(): boolean {
    return this.status === 'solved';
  }

  /** 空きマス数。 */
  get remainingCells(): number {
    let n = 0;
    for (let cell = 0; cell < CELLS; cell++) if (this.values[cell] === 0) n++;
    return n;
  }

  toJSON(): SerializedGame {
    return {
      puzzle: serializeGridCompact(this.puzzle),
      solution: serializeGridCompact(this.solution),
      difficulty: this.difficulty,
      seed: this.seed,
      values: serializeGridCompact(this.values),
      pencils: this.pencils.slice(),
      mistakes: this.mistakes,
      elapsedMs: this.elapsedMs,
    };
  }

  static fromJSON(data: SerializedGame): Game {
    const game = new Game({
      puzzle: parseGridCompact(data.puzzle),
      solution: parseGridCompact(data.solution),
      difficulty: data.difficulty,
      seed: data.seed,
    });
    game.values = parseGridCompact(data.values);
    game.pencils =
      Array.isArray(data.pencils) && data.pencils.length === CELLS
        ? data.pencils.slice()
        : new Array<number>(CELLS).fill(0);
    game.mistakes = data.mistakes ?? 0;
    game.elapsedMs = data.elapsedMs ?? 0;
    game.checkSolved();
    return game;
  }
}
