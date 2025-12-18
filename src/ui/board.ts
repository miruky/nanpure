/**
 * 盤面のSVG描画。
 *
 * 81マス分のノード(背景・確定値テキスト・メモ9個)を最初に一度だけ作り、以降は
 * クラスとテキストを書き換えるだけで再描画する。DOMを毎回作り直さないので軽く、
 * 背景色やメモの出入りにCSSトランジションをかけられる。罫線はブロック境界だけ太くする。
 */

import { bit, boxOf, colOf, type Grid, PEERS, rowOf, SIZE } from '../lib';

const CELL = 60;
const SPAN = CELL * SIZE;
const SVG_NS = 'http://www.w3.org/2000/svg';

export interface BoardView {
  readonly values: Grid;
  readonly given: readonly boolean[];
  readonly pencils: readonly number[];
  readonly selected: number | null;
  readonly conflicts: ReadonlySet<number>;
  readonly highlight: boolean;
  readonly hintCells: ReadonlySet<number>;
}

export interface BoardHandle {
  readonly el: SVGSVGElement;
  render(view: BoardView): void;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function createBoard(onSelect: (cell: number) => void): BoardHandle {
  const root = svg('svg', {
    viewBox: `-1 -1 ${SPAN + 2} ${SPAN + 2}`,
    class: 'board',
    role: 'img',
    'aria-label': '数独の盤面',
  });

  const bgLayer = svg('g', { class: 'cell-backgrounds' });
  const gridLayer = svg('g', { class: 'grid-lines' });
  const markLayer = svg('g', { class: 'cell-marks' });

  const backgrounds: SVGRectElement[] = [];
  const valueNodes: SVGTextElement[] = [];
  const pencilNodes: SVGTextElement[][] = [];

  for (let cell = 0; cell < SIZE * SIZE; cell++) {
    const x = colOf(cell) * CELL;
    const y = rowOf(cell) * CELL;

    const rect = svg('rect', {
      x,
      y,
      width: CELL,
      height: CELL,
      class: 'cell-bg',
    });
    backgrounds.push(rect);
    bgLayer.append(rect);

    const value = svg('text', {
      x: x + CELL / 2,
      y: y + CELL / 2 + 1,
      class: 'cell-value',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    valueNodes.push(value);
    markLayer.append(value);

    const pencils: SVGTextElement[] = [];
    for (let d = 1; d <= SIZE; d++) {
      const sub = d - 1;
      const px = x + ((sub % 3) + 0.5) * (CELL / 3);
      const py = y + (Math.floor(sub / 3) + 0.5) * (CELL / 3) + 0.5;
      const mark = svg('text', {
        x: px,
        y: py,
        class: 'pencil-mark',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      mark.textContent = String(d);
      pencils.push(mark);
      markLayer.append(mark);
    }
    pencilNodes.push(pencils);
  }

  // 罫線。3の倍数の境界を太線にしてブロックを区切る。
  for (let i = 0; i <= SIZE; i++) {
    const pos = i * CELL;
    const thick = i % 3 === 0;
    const cls = thick ? 'line line-strong' : 'line';
    gridLayer.append(svg('line', { x1: pos, y1: 0, x2: pos, y2: SPAN, class: cls }));
    gridLayer.append(svg('line', { x1: 0, y1: pos, x2: SPAN, y2: pos, class: cls }));
  }

  root.append(bgLayer, gridLayer, markLayer);

  root.addEventListener('pointerdown', (event) => {
    const rect = root.getBoundingClientRect();
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * SIZE);
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * SIZE);
    if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return;
    onSelect(row * SIZE + col);
  });

  function render(view: BoardView): void {
    const sel = view.selected;
    const selValue = sel !== null ? view.values[sel]! : 0;
    const selRow = sel !== null ? rowOf(sel) : -1;
    const selCol = sel !== null ? colOf(sel) : -1;
    const selBox = sel !== null ? boxOf(sel) : -1;
    const peerSet = sel !== null ? new Set(PEERS[sel]!) : null;

    for (let cell = 0; cell < SIZE * SIZE; cell++) {
      const value = view.values[cell]!;

      const bgClasses = ['cell-bg'];
      if (cell === sel) bgClasses.push('is-selected');
      else if (view.highlight && sel !== null) {
        if (selValue !== 0 && value === selValue) bgClasses.push('is-same');
        else if (
          rowOf(cell) === selRow ||
          colOf(cell) === selCol ||
          boxOf(cell) === selBox ||
          peerSet?.has(cell)
        ) {
          bgClasses.push('is-peer');
        }
      }
      if (view.hintCells.has(cell)) bgClasses.push('is-hint');
      backgrounds[cell]!.setAttribute('class', bgClasses.join(' '));

      const valueNode = valueNodes[cell]!;
      valueNode.textContent = value === 0 ? '' : String(value);
      const valueClasses = ['cell-value'];
      valueClasses.push(view.given[cell] ? 'is-given' : 'is-user');
      if (view.conflicts.has(cell)) valueClasses.push('is-conflict');
      if (selValue !== 0 && value === selValue) valueClasses.push('is-match');
      valueNode.setAttribute('class', valueClasses.join(' '));

      const mask = value === 0 ? view.pencils[cell]! : 0;
      const pencils = pencilNodes[cell]!;
      for (let d = 1; d <= SIZE; d++) {
        const on = (mask & bit(d)) !== 0;
        pencils[d - 1]!.setAttribute('class', on ? 'pencil-mark is-on' : 'pencil-mark');
      }
    }
  }

  return { el: root, render };
}
