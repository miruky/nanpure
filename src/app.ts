/**
 * アプリ本体。盤面・操作パネル・ヘッダをまとめ、ゲーム状態の変更を画面へ反映する。
 * 生成はやや時間がかかることがあるので、生成中の表示を挟んでからメインスレッドで走らせる。
 * 進行中のゲームと設定は localStorage に保存し、共有リンクからは同じ問題を復元する。
 */

import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty, generate, type Step } from './lib';
import { Game } from './game';
import { createBoard, type BoardHandle } from './ui/board';
import { createControls, type ControlsHandle } from './ui/controls';
import { icon } from './ui/icons';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type Settings } from './storage';
import { encodeShare, parseShare, shareUrl } from './share';

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = `${m}`.padStart(h > 0 ? 2 : 1, '0');
  const ss = `${s}`.padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function button(className: string, label: string, iconName?: Parameters<typeof icon>[0]): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.innerHTML = `${iconName ? icon(iconName) : ''}<span>${label}</span>`;
  return b;
}

export function mountApp(root: HTMLElement): void {
  let settings: Settings = loadSettings();
  let game: Game | null = null;
  let paused = false;
  let currentHint: Step | null = null;
  let unsubscribe: (() => void) | null = null;

  // ---- 骨組み ----
  root.innerHTML = '';
  const app = document.createElement('div');
  app.className = 'app';

  const header = document.createElement('header');
  header.className = 'app-header';
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = `<img class="brand-logo" src="${import.meta.env.BASE_URL}logo.svg" alt="" width="32" height="32" /><h1>ナンプレ</h1>`;
  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';
  const newBtn = button('ghost', '新規', 'refresh');
  const pauseBtn = button('ghost', '中断', 'pause');
  const shareBtn = button('ghost', '共有', 'share');
  const themeBtn = button('ghost icon-only', 'テーマ', 'sun');
  themeBtn.querySelector('span')!.classList.add('visually-hidden');
  headerActions.append(newBtn, pauseBtn, shareBtn, themeBtn);
  header.append(brand, headerActions);

  const meta = document.createElement('div');
  meta.className = 'meta-bar';
  const diffChip = document.createElement('span');
  diffChip.className = 'chip chip-difficulty';
  const timerChip = document.createElement('span');
  timerChip.className = 'chip chip-timer';
  timerChip.innerHTML = `<span class="chip-key">時間</span><span class="chip-value" id="timer">0:00</span>`;
  const mistakeChip = document.createElement('span');
  mistakeChip.className = 'chip chip-mistakes';
  mistakeChip.innerHTML = `<span class="chip-key">ミス</span><span class="chip-value" id="mistakes">0</span>`;
  const highlightToggle = document.createElement('button');
  highlightToggle.type = 'button';
  highlightToggle.className = 'chip chip-toggle';
  meta.append(diffChip, timerChip, mistakeChip, highlightToggle);

  const playArea = document.createElement('main');
  playArea.className = 'play-area';
  const boardWrap = document.createElement('div');
  boardWrap.className = 'board-wrap';
  const side = document.createElement('div');
  side.className = 'side';
  playArea.append(boardWrap, side);

  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('aria-live', 'polite');

  app.append(header, meta, playArea, status);
  root.append(app);

  const board: BoardHandle = createBoard(handleSelect);
  boardWrap.append(board.el);

  // 一時停止と勝利のオーバーレイ
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.hidden = true;
  boardWrap.append(overlay);

  const controls: ControlsHandle = createControls({
    onDigit: (d) => withGame((g) => g.enter(d)),
    onErase: () => withGame((g) => g.clear()),
    onUndo: () => withGame((g) => g.undo()),
    onRedo: () => withGame((g) => g.redo()),
    onTogglePencil: () => withGame((g) => g.togglePencilMode()),
    onHint: showHint,
  });
  side.append(controls.el);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.hidden = true;
  app.append(toast);

  // ---- 配線 ----
  newBtn.addEventListener('click', openDifficultyMenu);
  pauseBtn.addEventListener('click', togglePause);
  shareBtn.addEventListener('click', shareCurrent);
  themeBtn.addEventListener('click', cycleTheme);
  highlightToggle.addEventListener('click', () => {
    settings = { ...settings, highlight: !settings.highlight };
    saveSettings(settings);
    syncSettingChips();
    render();
  });

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
  });

  applyTheme();
  syncSettingChips();
  startTimer();
  boot();

  // ---- ふるまい ----
  function withGame(fn: (g: Game) => void): void {
    if (!game || paused || game.isSolved) return;
    currentHint = null;
    fn(game);
  }

  function boot(): void {
    const fromHash = parseShare(location.hash);
    if (fromHash) {
      startGenerated(fromHash.difficulty, fromHash.seed);
      return;
    }
    const saved = loadGame();
    if (saved) {
      try {
        setGame(Game.fromJSON(saved));
        return;
      } catch {
        clearGame();
      }
    }
    openDifficultyMenu();
  }

  function setGame(next: Game): void {
    unsubscribe?.();
    game = next;
    game.autoClean = settings.autoClean;
    paused = false;
    currentHint = null;
    unsubscribe = game.subscribe(() => {
      persist();
      render();
    });
    setStatus('');
    render();
  }

  function startGenerated(difficulty: Difficulty, seed?: number): void {
    showLoading(true);
    // オーバーレイを先に描画させてから生成する
    window.setTimeout(() => {
      const puzzle = generate(seed === undefined ? { difficulty } : { difficulty, seed });
      const next = new Game({
        puzzle: puzzle.puzzle,
        solution: puzzle.solution,
        difficulty: puzzle.difficulty,
        seed: puzzle.seed,
      });
      location.hash = encodeShare({ seed: next.seed, difficulty: next.difficulty });
      showLoading(false);
      setGame(next);
    }, 16);
  }

  function handleSelect(cell: number): void {
    if (!game || paused) return;
    game.select(cell);
  }

  function showHint(): void {
    if (!game || paused || game.isSolved) return;
    const step = game.hint();
    if (!step) {
      setStatus(game.conflicts().size > 0 ? '矛盾があります。誤りを見直してください。' : '論理だけでは進めません。');
      currentHint = null;
      render();
      return;
    }
    currentHint = step;
    if (step.placements[0]) game.select(step.placements[0].cell);
    render();
    showHintBanner(step);
  }

  // ---- 描画 ----
  function render(): void {
    if (!game) return;
    diffChip.textContent = DIFFICULTY_LABELS[game.difficulty];
    diffChip.dataset.level = game.difficulty;
    timerChip.querySelector('#timer')!.textContent = formatTime(game.elapsedMs);
    const mistakesEl = mistakeChip.querySelector('#mistakes')!;
    mistakesEl.textContent = String(game.mistakes);
    mistakeChip.classList.toggle('has-mistakes', game.mistakes > 0);

    const hintCells = new Set<number>(currentHint ? currentHint.reason : []);
    board.render({
      values: game.values,
      given: game.given,
      pencils: game.pencils,
      selected: game.selected,
      conflicts: game.conflicts(),
      highlight: settings.highlight,
      hintCells,
    });
    controls.update({
      remaining: game.remaining(),
      pencilMode: game.pencilMode,
      canUndo: game.canUndo,
      canRedo: game.canRedo,
    });

    if (game.isSolved) showWin();
    else if (paused) showPause();
    else hideOverlay();
  }

  function setStatus(text: string): void {
    status.textContent = text;
    status.classList.toggle('is-visible', text !== '');
  }

  function showHintBanner(step: Step): void {
    status.innerHTML = '';
    status.classList.add('is-visible');
    const text = document.createElement('span');
    text.textContent = step.explain;
    const apply = button('link-button', step.placements.length > 0 ? 'この手を打つ' : '候補を消す');
    apply.addEventListener('click', () => {
      if (!game) return;
      game.applyHint(step);
      currentHint = null;
      setStatus('');
    });
    status.append(text, apply);
  }

  // ---- オーバーレイ ----
  function hideOverlay(): void {
    overlay.hidden = true;
    overlay.innerHTML = '';
    overlay.className = 'overlay';
  }

  function showLoading(on: boolean): void {
    if (!on) {
      hideOverlay();
      return;
    }
    overlay.className = 'overlay is-loading';
    overlay.hidden = false;
    overlay.innerHTML = `<div class="overlay-card"><div class="spinner" aria-hidden="true"></div><p>問題を生成中…</p></div>`;
  }

  function showPause(): void {
    overlay.className = 'overlay is-pause';
    overlay.hidden = false;
    overlay.innerHTML = `<div class="overlay-card"><p>一時停止中</p></div>`;
    const resume = button('primary', '再開', 'play');
    resume.addEventListener('click', togglePause);
    overlay.querySelector('.overlay-card')!.append(resume);
  }

  function showWin(): void {
    if (!game) return;
    overlay.className = 'overlay is-win';
    overlay.hidden = false;
    const stats = `<dl class="win-stats">
      <div><dt>難易度</dt><dd>${DIFFICULTY_LABELS[game.difficulty]}</dd></div>
      <div><dt>時間</dt><dd>${formatTime(game.elapsedMs)}</dd></div>
      <div><dt>ミス</dt><dd>${game.mistakes}</dd></div>
    </dl>`;
    overlay.innerHTML = `<div class="overlay-card"><div class="win-mark">${icon('check')}</div><h2>クリア</h2>${stats}</div>`;
    const again = button('primary', 'もう一局', 'refresh');
    again.addEventListener('click', openDifficultyMenu);
    overlay.querySelector('.overlay-card')!.append(again);
    clearGame();
  }

  // ---- 難易度メニュー ----
  function openDifficultyMenu(): void {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', '難易度を選ぶ');
    const heading = document.createElement('h2');
    heading.textContent = '難易度を選ぶ';
    const list = document.createElement('div');
    list.className = 'difficulty-list';
    for (const d of DIFFICULTIES) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'difficulty-item';
      item.dataset.level = d;
      item.innerHTML = `<span class="difficulty-name">${DIFFICULTY_LABELS[d]}</span><span class="difficulty-mark" aria-hidden="true"></span>`;
      item.addEventListener('click', () => {
        close();
        startGenerated(d);
      });
      list.append(item);
    }
    const cancel = button('ghost', '閉じる', 'close');
    cancel.addEventListener('click', close);
    dialog.append(heading, list, cancel);
    back.append(dialog);
    app.append(back);
    requestAnimationFrame(() => back.classList.add('is-open'));
    function close(): void {
      back.classList.remove('is-open');
      window.setTimeout(() => back.remove(), 180);
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back && game) close();
    });
    document.addEventListener('keydown', onEsc);
  }

  // ---- ヘッダ操作 ----
  function togglePause(): void {
    if (!game || game.isSolved) return;
    paused = !paused;
    pauseBtn.querySelector('span')!.textContent = paused ? '再開' : '中断';
    render();
  }

  function shareCurrent(): void {
    if (!game) return;
    const url = shareUrl(location.href, { seed: game.seed, difficulty: game.difficulty });
    const done = () => showToast('共有リンクをコピーしました');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => showToast(url));
    } else {
      showToast(url);
    }
  }

  function cycleTheme(): void {
    const order: Settings['theme'][] = ['auto', 'light', 'dark'];
    const i = order.indexOf(settings.theme);
    settings = { ...settings, theme: order[(i + 1) % order.length]! };
    saveSettings(settings);
    applyTheme();
  }

  function applyTheme(): void {
    const html = document.documentElement;
    if (settings.theme === 'auto') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', settings.theme);
    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'auto' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    themeBtn.innerHTML = `${icon(dark ? 'moon' : 'sun')}<span class="visually-hidden">テーマ: ${settings.theme}</span>`;
  }

  function syncSettingChips(): void {
    highlightToggle.textContent = settings.highlight ? '強調 オン' : '強調 オフ';
    highlightToggle.classList.toggle('is-active', settings.highlight);
    highlightToggle.setAttribute('aria-pressed', String(settings.highlight));
  }

  // ---- キーボード ----
  function onKey(e: KeyboardEvent): void {
    if (!game) return;
    if (e.key === 'Escape') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const sel = game.selected;
    if (e.key >= '1' && e.key <= '9') {
      withGame((g) => g.enter(Number(e.key)));
      e.preventDefault();
    } else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
      withGame((g) => g.clear());
      e.preventDefault();
    } else if (e.key.startsWith('Arrow')) {
      moveSelection(e.key, sel);
      e.preventDefault();
    } else if (e.key === 'p' || e.key === 'P') {
      game.togglePencilMode();
    } else if (e.key === 'h' || e.key === 'H') {
      showHint();
    } else if (e.key === 'u' || e.key === 'U') {
      withGame((g) => g.undo());
    }
  }

  function moveSelection(key: string, sel: number | null): void {
    if (!game) return;
    if (sel === null) {
      game.select(40);
      return;
    }
    let row = Math.floor(sel / 9);
    let col = sel % 9;
    if (key === 'ArrowUp') row = (row + 8) % 9;
    else if (key === 'ArrowDown') row = (row + 1) % 9;
    else if (key === 'ArrowLeft') col = (col + 8) % 9;
    else if (key === 'ArrowRight') col = (col + 1) % 9;
    game.select(row * 9 + col);
  }

  // ---- タイマー・保存・トースト ----
  function startTimer(): void {
    let last = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      if (game && !paused && !game.isSolved && !document.hidden) {
        game.elapsedMs += delta;
        timerChip.querySelector('#timer')!.textContent = formatTime(game.elapsedMs);
      }
    }, 250);
  }

  function persist(): void {
    if (game && !game.isSolved) saveGame(game.toJSON());
  }

  let toastTimer = 0;
  function showToast(message: string): void {
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => (toast.hidden = true), 200);
    }, 2200);
  }
}
