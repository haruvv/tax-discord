import { describe, expect, test } from "vitest";
import { calcSalaryIncome } from "../../scripts/tax-rules/income/salary.js";
import { rules2025 } from "../../scripts/tax-rules/2025.js";
import type { IncomeEntry } from "../../scripts/tax-rules/types.js";

const entry = (amount: number): IncomeEntry => ({
  type: "給与所得",
  amount,
});

describe("calcSalaryIncome", () => {
  test("単一エントリ: 控除額が正しい", () => {
    const results = calcSalaryIncome([entry(4_000_000)], rules2025);
    expect(results).toHaveLength(1);
    const r = results[0];
    // 360万超660万以下 → revenue * 0.2 + 440_000 = 1_240_000
    expect(r.deduction_amount).toBe(1_240_000);
    expect(r.income_amount).toBe(4_000_000 - 1_240_000);
    expect(r.deduction_label).toBe("給与所得控除");
  });

  test("複数エントリ: 按分（端数が最後のエントリへ）", () => {
    const results = calcSalaryIncome(
      [entry(3_000_000), entry(1_000_000)],
      rules2025,
    );
    expect(results).toHaveLength(2);

    // 合計収入 4_000_000 → 控除 1_240_000
    const totalDeduction = results.reduce((s, r) => s + r.deduction_amount, 0);
    expect(totalDeduction).toBe(1_240_000);

    // 1つ目: floor(1_240_000 * 3_000_000 / 4_000_000) = floor(930_000) = 930_000
    expect(results[0].deduction_amount).toBe(930_000);
    // 2つ目: 残り = 1_240_000 - 930_000 = 310_000
    expect(results[1].deduction_amount).toBe(310_000);
  });

  test("収入0", () => {
    const results = calcSalaryIncome([entry(0)], rules2025);
    expect(results).toHaveLength(1);
    expect(results[0].deduction_amount).toBe(0);
    expect(results[0].income_amount).toBe(0);
  });
});
