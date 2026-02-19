import { describe, expect, test } from "vitest";
import { calcMiscIncome } from "../../scripts/tax-rules/income/misc.js";
import { rules2025 } from "../../scripts/tax-rules/2025.js";
import type { IncomeEntry } from "../../scripts/tax-rules/types.js";

describe("calcMiscIncome", () => {
  test("経費あり", () => {
    const results = calcMiscIncome(
      [{ type: "雑所得", amount: 1_000_000, expenses: 300_000 }],
      rules2025,
    );
    expect(results).toHaveLength(1);
    expect(results[0].deduction_amount).toBe(300_000);
    expect(results[0].income_amount).toBe(700_000);
    expect(results[0].deduction_label).toBe("必要経費");
  });

  test("経費なし", () => {
    const results = calcMiscIncome(
      [{ type: "雑所得", amount: 500_000 }],
      rules2025,
    );
    expect(results[0].deduction_amount).toBe(0);
    expect(results[0].income_amount).toBe(500_000);
  });

  test("経費 > 収入（0 にクランプ）", () => {
    const results = calcMiscIncome(
      [{ type: "雑所得", amount: 200_000, expenses: 500_000 }],
      rules2025,
    );
    expect(results[0].deduction_amount).toBe(500_000);
    expect(results[0].income_amount).toBe(0);
  });
});
