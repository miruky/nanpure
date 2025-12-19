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
import {
  clearGame,
  loadGame,
  loadSettings,
  loadStats,
  saveGame,
  saveSettings,
  saveStats,
  type Settings,
} from './storage';
import { recordWin, type Stats } from './stats';
import { encodeShare, parseShare, shareUrl } from './share';

/** 各難易度をひと言で表す。難易度メニューで「何が出るか」を伝える。 */
const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  easy: '基本の手筋だけで解ける',
  medium: '行・列・ブロックの絞り込み',
  hard: 'ペア・トリプルの除外まで',
  expert: '高度な手筋を総動員',
};

const LOGO_MARK =
  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false">' +
  '<rect x="3" y="3" width="18" height="18" rx="1.5"/>' +
  '<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>';

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

/** アイコンだけのボタン。ラベルは視覚的に隠しつつ aria/title で伝える。 */
function iconButton(className: string, label: string, iconName: Parameters<typeof icon>[0]): HTMLButtonElement {
  const b = button(className, label, iconName);
  b.querySelector('span')!.classList.add('visually-hidden');
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

export function mountApp(root: HTMLElement): void {
  let settings: Settings = loadSettings();
  let stats: Stats = loadStats();
  let game: Game | null = null;
  let paused = false;
  let recorded = false;
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
  brand.innerHTML =
    `<span class="brand-logo">${LOGO_MARK}</span>` +
    `<span class="brand-text"><span class="kicker">論理パズル</span><h1>ナンプレ</h1></span>`;
  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';
  const newBtn = button('ghost', '新規', 'refresh');
  const pauseBtn = button('ghost', '中断', 'pause');
  const shareBtn = button('ghost', '共有', 'share');
  const statsBtn = iconButton('ghost icon-only', '成績', 'chart');
  const helpBtn = iconButton('ghost icon-only', '操作説明', 'help');
  const themeBtn = iconButton('ghost icon-only', 'テーマ', 'sun');
  headerActions.append(newBtn, pauseBtn, shareBtn, statsBtn, helpBtn, themeBtn);
  header.append(brand, headerActions);

  const meta = document.createElement('div');
  meta.className = 'meta-bar';
  const diffChip = document.createElement('div');
  diffChip.className = 'stat stat--difficulty';
  diffChip.innerHTML = `<span class="stat-key">難易度</span><span class="stat-value" id="difficulty">—</span>`;
  const diffValue = diffChip.querySelector('#difficulty')!;
  const timerChip = document.createElement('div');
  timerChip.className = 'stat stat--timer';
  timerChip.innerHTML = `<span class="stat-key">時間</span><span class="stat-value" id="timer">0:00</span>`;
  const mistakeChip = document.createElement('div');
  mistakeChip.className = 'stat stat--mistakes';
  mistakeChip.innerHTML = `<span class="stat-key">ミス</span><span class="stat-value" id="mistakes">0</span>`;
  const highlightToggle = document.createElement('button');
  highlightToggle.type = 'button';
  highlightToggle.className = 'toggle';
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
    onFillPencils: () => withGame((g) => g.fillPencils()),
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
  statsBtn.addEventListener('click', openStats);
  helpBtn.addEventListener('click', openHelp);
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
    recorded = false;
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
    diffValue.textContent = DIFFICULTY_LABELS[game.difficulty];
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
      current: game.selected !== null ? game.values[game.selected]! : 0,
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
    overlay.innerHTML = `<div class="overlay-card"><p class="loading-label">問題を生成中</p><span class="loading-bar" aria-hidden="true"></span></div>`;
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

    // 同じクリアを複数回数えないよう、最初の到達時だけ成績へ記録する。
    let newBest = false;
    let flawless = false;
    let firstClear = false;
    if (!recorded) {
      recorded = true;
      const prevBest = stats.byDifficulty[game.difficulty].bestMs;
      const outcome = recordWin(stats, {
        difficulty: game.difficulty,
        elapsedMs: game.elapsedMs,
        mistakes: game.mistakes,
      });
      stats = outcome.stats;
      saveStats(stats);
      // 「自己ベスト更新」は既存記録を縮めたときだけ。初回は「初クリア」とする。
      firstClear = prevBest === null;
      newBest = outcome.newBest && !firstClear;
      flawless = outcome.flawless;
    }

    const badges: string[] = [];
    if (firstClear) badges.push('<span class="badge">初クリア</span>');
    else if (newBest) badges.push('<span class="badge">自己ベスト更新</span>');
    if (flawless) badges.push('<span class="badge badge--flawless">ノーミス</span>');
    const badgeHtml = badges.length ? `<div class="win-badges">${badges.join('')}</div>` : '';

    const detail = `<dl class="win-stats">
      <div><dt>難易度</dt><dd>${DIFFICULTY_LABELS[game.difficulty]}</dd></div>
      <div><dt>時間</dt><dd>${formatTime(game.elapsedMs)}</dd></div>
      <div><dt>ミス</dt><dd>${game.mistakes}</dd></div>
    </dl>`;
    overlay.innerHTML =
      `<div class="overlay-card"><div class="win-mark">${icon('check')}</div>` +
      `<p class="win-title">クリア</p>${badgeHtml}${detail}</div>`;
    const again = button('primary', 'もう一局', 'refresh');
    again.addEventListener('click', openDifficultyMenu);
    overlay.querySelector('.overlay-card')!.append(again);
    clearGame();
  }

  // ---- モーダル ----
  /** 難易度・成績・操作説明で共通の枠を作る。本文は build() で組み立てる。 */
  function openModal(opts: {
    title: string;
    dismissable?: boolean;
    build: (body: HTMLElement, close: () => void) => void;
  }): void {
    const dismissable = opts.dismissable ?? true;
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', opts.title);

    const head = document.createElement('div');
    head.className = 'modal-head';
    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = opts.title;
    head.append(title);
    if (dismissable) {
      const closeBtn = iconButton('modal-close', '閉じる', 'close');
      closeBtn.addEventListener('click', close);
      head.append(closeBtn);
    }

    const body = document.createElement('div');
    opts.build(body, close);
    dialog.append(head, body);
    back.append(dialog);
    app.append(back);
    requestAnimationFrame(() => back.classList.add('is-open'));
    (dialog.querySelector('button') ?? dialog).focus?.();

    function close(): void {
      back.classList.remove('is-open');
      window.setTimeout(() => back.remove(), 200);
      document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        close();
      }
    }
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back && dismissable) close();
    });
    document.addEventListener('keydown', onEsc);
  }

  function openDifficultyMenu(): void {
    openModal({
      title: '難易度を選ぶ',
      dismissable: game !== null,
      build(body, close) {
        const list = document.createElement('div');
        list.className = 'difficulty-list';
        for (const d of DIFFICULTIES) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'difficulty-item';
          item.dataset.level = d;
          item.innerHTML =
            `<span class="difficulty-mark" aria-hidden="true"></span>` +
            `<span class="difficulty-body"><span class="difficulty-name">${DIFFICULTY_LABELS[d]}</span>` +
            `<span class="difficulty-desc">${DIFFICULTY_HINTS[d]}</span></span>`;
          item.addEventListener('click', () => {
            close();
            startGenerated(d);
          });
          list.append(item);
        }
        body.append(list);
      },
    });
  }

  function openStats(): void {
    openModal({
      title: '成績',
      build(body) {
        if (stats.totalSolved === 0) {
          const note = document.createElement('p');
          note.className = 'empty-note';
          note.textContent = 'まだクリア記録はありません。一局解くと、難易度ごとの最短時間がここに残ります。';
          body.append(note);
          return;
        }
        const records = document.createElement('div');
        records.className = 'records';
        for (const d of DIFFICULTIES) {
          const r = stats.byDifficulty[d];
          const row = document.createElement('div');
          row.className = 'record-row';
          const best = r.bestMs === null ? '—' : formatTime(r.bestMs);
          row.innerHTML =
            `<span class="record-name">${DIFFICULTY_LABELS[d]}</span>` +
            `<span class="record-best">${best}</span>` +
            `<span class="record-count">${r.solved}局</span>`;
          records.append(row);
        }
        const summary = document.createElement('dl');
        summary.className = 'records-summary';
        summary.innerHTML =
          `<div><dt>クリア総数</dt><dd>${stats.totalSolved}</dd></div>` +
          `<div><dt>ノーミス連勝</dt><dd>${stats.flawlessStreak}</dd></div>`;
        body.append(records, summary);
      },
    });
  }

  function openHelp(): void {
    const rows: [string, string[]][] = [
      ['数字を入力', ['1', '…', '9']],
      ['消す', ['0', 'Del']],
      ['マスを移動', ['←', '↑', '↓', '→']],
      ['メモのオン/オフ', ['P']],
      ['空きマスに候補を一括メモ', ['F']],
      ['ヒント', ['H']],
      ['元に戻す', ['U']],
    ];
    openModal({
      title: '操作説明',
      build(body) {
        const list = document.createElement('div');
        list.className = 'help-list';
        for (const [label, keys] of rows) {
          const row = document.createElement('div');
          row.className = 'help-row';
          const name = document.createElement('span');
          name.textContent = label;
          const kbd = document.createElement('span');
          kbd.className = 'kbd';
          kbd.innerHTML = keys
            .map((k) => (k === '…' ? `<span aria-hidden="true">…</span>` : `<kbd>${k}</kbd>`))
            .join('');
          row.append(name, kbd);
          list.append(row);
        }
        body.append(list);
      },
    });
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
    } else if (e.key === 'f' || e.key === 'F') {
      withGame((g) => g.fillPencils());
    } else if (e.key === 'h' || e.key === 'H') {
      showHint();
    } else if (e.key === 'u' || e.key === 'U') {
      withGame((g) => g.undo());
    } else if (e.key === '?') {
      openHelp();
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
