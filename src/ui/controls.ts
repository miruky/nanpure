/**
 * 数字パッドと操作ボタン。数字ボタンには残り個数を出し、9個置き終えた数字は
 * 控えめに沈めて「もう置けない」ことを示す。メモ・取り消し・やり直し・ヒント・消去は
 * アイコン付きのボタンにまとめる。状態は update() で受け取って見た目へ反映する。
 */

import { SIZE } from '../lib';
import { icon, type IconName } from './icons';

export interface ControlHandlers {
  onDigit(digit: number): void;
  onErase(): void;
  onUndo(): void;
  onRedo(): void;
  onTogglePencil(): void;
  onHint(): void;
}

export interface ControlState {
  remaining: readonly number[];
  pencilMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ControlsHandle {
  readonly el: HTMLElement;
  update(state: ControlState): void;
}

function actionButton(label: string, name: IconName, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'action';
  button.innerHTML = `${icon(name)}<span class="action-label">${label}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

export function createControls(handlers: ControlHandlers): ControlsHandle {
  const root = document.createElement('div');
  root.className = 'controls';

  const actions = document.createElement('div');
  actions.className = 'action-row';
  const undo = actionButton('戻す', 'undo', handlers.onUndo);
  const redo = actionButton('やり直し', 'redo', handlers.onRedo);
  const erase = actionButton('消す', 'eraser', handlers.onErase);
  const pencil = actionButton('メモ', 'pencil', handlers.onTogglePencil);
  pencil.setAttribute('aria-pressed', 'false');
  const hint = actionButton('ヒント', 'bulb', handlers.onHint);
  actions.append(undo, redo, erase, pencil, hint);

  const pad = document.createElement('div');
  pad.className = 'number-pad';
  const digitButtons: HTMLButtonElement[] = [];
  const remainNodes: HTMLSpanElement[] = [];
  for (let d = 1; d <= SIZE; d++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'num';
    button.setAttribute('aria-label', `${d} を入力`);
    const digit = document.createElement('span');
    digit.className = 'num-digit';
    digit.textContent = String(d);
    const left = document.createElement('span');
    left.className = 'num-left';
    button.append(digit, left);
    button.addEventListener('click', () => handlers.onDigit(d));
    pad.append(button);
    digitButtons.push(button);
    remainNodes.push(left);
  }

  root.append(actions, pad);

  function update(state: ControlState): void {
    pencil.classList.toggle('is-active', state.pencilMode);
    pencil.setAttribute('aria-pressed', String(state.pencilMode));
    undo.disabled = !state.canUndo;
    redo.disabled = !state.canRedo;
    for (let d = 1; d <= SIZE; d++) {
      const left = state.remaining[d] ?? 0;
      remainNodes[d - 1]!.textContent = left > 0 ? String(left) : '';
      digitButtons[d - 1]!.classList.toggle('is-done', left <= 0);
      digitButtons[d - 1]!.disabled = left <= 0;
    }
  }

  return { el: root, update };
}
