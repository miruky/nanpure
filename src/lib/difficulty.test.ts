import { describe, expect, it } from 'vitest';
import { parseGrid } from './board';
import { DIFFICULTIES, DIFFICULTY_LABELS, rateDifficulty } from './difficulty';
import { generate } from './generator';

const EASY =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('rateDifficulty', () => {
  it('完成済み盤面はやさしい・手数0', () => {
    const r = rateDifficulty(parseGrid(SOLUTION));
    expect(r.level).toBe('easy');
    expect(r.steps).toBe(0);
    expect(r.solvedLogically).toBe(true);
  });

  it('シングルだけで解ける問題はやさしく、推測不要', () => {
    const r = rateDifficulty(parseGrid(EASY));
    expect(r.solvedLogically).toBe(true);
    expect(r.level).not.toBe('expert');
    expect(r.techniquesUsed.length).toBeGreaterThan(0);
  });

  it('上級テクニックが要る問題はむずかしいと判定し、推測なしで解ける', () => {
    const hard = generate({ difficulty: 'hard', seed: 1, maxAttempts: 40 });
    expect(hard.difficulty).toBe('hard');
    const r = rateDifficulty(hard.puzzle);
    expect(r.level).toBe('hard');
    expect(r.solvedLogically).toBe(true);
  });

  it('論理だけでは進めない問題はエキスパート', () => {
    const expert = generate({ difficulty: 'expert', seed: 1, maxAttempts: 40 });
    expect(expert.difficulty).toBe('expert');
    expect(rateDifficulty(expert.puzzle).solvedLogically).toBe(false);
  });
});

describe('難易度の定義', () => {
  it('4段階すべてに日本語ラベルがある', () => {
    for (const d of DIFFICULTIES) {
      expect(DIFFICULTY_LABELS[d]).toBeTruthy();
    }
  });
});
