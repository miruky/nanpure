/**
 * 設定と進行中のゲームを localStorage に保存する薄い層。プライベートブラウズなどで
 * localStorage が使えない場合に例外でアプリが止まらないよう、読み書きは握りつぶす。
 */

import type { SerializedGame } from './game';
import { normalizeStats, type Stats } from './stats';

const GAME_KEY = 'nanpure:game';
const SETTINGS_KEY = 'nanpure:settings';
const STATS_KEY = 'nanpure:stats';

export type ThemePref = 'auto' | 'light' | 'dark';

export interface Settings {
  /** 配色。auto は OS の設定に従う。 */
  theme: ThemePref;
  /** 選択マスと同じ数字・同じ行列ブロックを強調する。 */
  highlight: boolean;
  /** 数字を確定したとき、関係するマスのメモから自動でその数字を消す。 */
  autoClean: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  highlight: true,
  autoClean: true,
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても操作は続行する
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 何もしない
  }
}

export function loadSettings(): Settings {
  const raw = read(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadGame(): SerializedGame | null {
  const raw = read(GAME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SerializedGame;
  } catch {
    return null;
  }
}

export function saveGame(game: SerializedGame): void {
  write(GAME_KEY, JSON.stringify(game));
}

export function clearGame(): void {
  remove(GAME_KEY);
}

export function loadStats(): Stats {
  const raw = read(STATS_KEY);
  if (!raw) return normalizeStats(null);
  try {
    return normalizeStats(JSON.parse(raw));
  } catch {
    return normalizeStats(null);
  }
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, JSON.stringify(stats));
}
