/**
 * シード付き擬似乱数生成器(mulberry32)。
 *
 * 同じシードからは必ず同じ盤面が出るようにするためのもの。これにより
 * 「この難易度のこの番号の問題」をURLで共有でき、テストも決定的に書ける。
 * 暗号用途には使わない。
 */

export interface Rng {
  /** 0以上1未満の浮動小数。 */
  next(): number;
  /** 0以上 n 未満の整数。 */
  int(n: number): number;
  /** 配列をフィッシャー・イェーツ法で破壊的にシャッフルし、その配列を返す。 */
  shuffle<T>(arr: T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number): number => Math.floor(next() * n);
  return {
    next,
    int,
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
      }
      return arr;
    },
  };
}

/** 文字列を32bitのシード値へ畳み込む(共有コードの復元に使う)。 */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
