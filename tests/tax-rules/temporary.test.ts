import { describe, expect, test } from "vitest";
import { calcTemporaryIncome } from "../../scripts/tax-rules/income/temporary.js";
import { rules2025 } from "../../scripts/tax-rules/2025.js";
import type { IncomeEntry } from "../../scripts/tax-rules/types.js";

describe("calcTemporaryIncome", () => {
  test("単一エントリ: 50万控除 + 1/2課税", () => {
    // 収入 2_000_000, 経費 200_000
    // rawNet = 1_800_000
    // adjusted = max(0, 1_800_000 - 500_000) / 2 = 650_000
    const results = calcTemporaryIncome(
      [{ type: "一時所得", amount: 2_000_000, expenses: 200_000 }],
      rules2025,
    );
    expect(results).toHaveLength(1);
    expect(results[0].revenue).toBe(2_000_000);
    expect(results[0].deduction_amount).toBe(200_000);
    expect(results[0].income_amount).toBe(650_000);
  });

  test("複数エントリ: 黒字按分", () => {
    // entry1: 1_500_000 - 200_000 = 1_300_000 (positive)
    // entry2: 1_000_000 - 100_000 = 900_000 (positive)
    // totalRawNet = 2_200_000
    // adjusted = (2_200_000 - 500_000) / 2 = 850_000
    // totalPositive = 2_200_000
    // entry1 share: floor(850_000 * 1_300_000 / 2_200_000) = floor(502_272.7...) = 502_272
    // entry2 share (last): 850_000 - 502_272 = 347_728
    const results = calcTemporaryIncome(
      [
        { type: "一時所得", amount: 1_500_000, expenses: 200_000 },
        { type: "一時所得", amount: 1_000_000, expenses: 100_000 },
      ],
      rules2025,
    );
    expect(results).toHaveLength(2);
    expect(results[0].income_amount).toBe(502_272);
    expect(results[1].income_amount).toBe(347_728);
    expect(results[0].income_amount + results[1].income_amount).toBe(
      Math.floor(850_000),
    );
  });

  test("黒字+赤字混在", () => {
    // entry1: 2_000_000 - 100_000 = 1_900_000 (positive)
    // entry2: 100_000 - 500_000 = -400_000 (negative)
    // totalRawNet = 1_500_000
    // adjusted = (1_500_000 - 500_000) / 2 = 500_000
    // positiveNets = [1_900_000, 0], totalPositive = 1_900_000
    // entry1 is last positive → gets all 500_000
    // entry2 → 0
    const results = calcTemporaryIncome(
      [
        { type: "一時所得", amount: 2_000_000, expenses: 100_000 },
        { type: "一時所得", amount: 100_000, expenses: 500_000 },
      ],
      rules2025,
    );
    expect(results[0].income_amount).toBe(500_000);
    expect(results[1].income_amount).toBe(0);
  });

  test("全体赤字", () => {
    // entry1: 100_000 - 500_000 = -400_000
    // totalRawNet = -400_000 → adjustedTotal = 0
    const results = calcTemporaryIncome(
      [{ type: "一時所得", amount: 100_000, expenses: 500_000 }],
      rules2025,
    );
    expect(results[0].income_amount).toBe(0);
  });

  test("50万以下", () => {
    // rawNet = 400_000 → adjusted = max(0, 400_000 - 500_000) / 2 = 0
    const results = calcTemporaryIncome(
      [{ type: "一時所得", amount: 500_000, expenses: 100_000 }],
      rules2025,
    );
    expect(results[0].income_amount).toBe(0);
  });
});
