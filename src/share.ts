/**
 * 問題の共有。生成器はシードと難易度から同じ問題を再現できるので、URLのハッシュへ
 * その2つを載せるだけで「この問題を一緒に解こう」と渡せる。盤面81マスを埋め込むより
 * 短く、リンクが壊れにくい。
 */

import { DIFFICULTIES, type Difficulty } from './lib';

export interface ShareParams {
  seed: number;
  difficulty: Difficulty;
}

function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

/** seed と難易度を `#s=...&d=...` 形式のハッシュ文字列にする。 */
export function encodeShare({ seed, difficulty }: ShareParams): string {
  const params = new URLSearchParams();
  params.set('s', (seed >>> 0).toString(36));
  params.set('d', difficulty);
  return `#${params.toString()}`;
}

/** ハッシュ文字列を解釈する。形式が不正なら null。 */
export function parseShare(hash: string): ShareParams | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return null;
  const params = new URLSearchParams(raw);
  const s = params.get('s');
  const d = params.get('d');
  if (!s || !d || !isDifficulty(d)) return null;
  const seed = parseInt(s, 36);
  if (!Number.isFinite(seed) || seed < 0) return null;
  return { seed: seed >>> 0, difficulty: d };
}

/** 現在のページURLに共有ハッシュを付けた絶対URLを作る。 */
export function shareUrl(base: string, params: ShareParams): string {
  const url = base.split('#')[0] ?? base;
  return url + encodeShare(params);
}
