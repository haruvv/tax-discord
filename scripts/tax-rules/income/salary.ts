import type { IncomeCalculator, IncomeDetail, IncomeEntry, TaxRules } from "../types.js";

export const calcSalaryIncome: IncomeCalculator = (
  entries: IncomeEntry[],
  rules: TaxRules,
): IncomeDetail[] => {
  const totalRevenue = entries.reduce((sum, e) => sum + e.amount, 0);
  const totalDeduction = totalRevenue > 0
    ? rules.calcSalaryDeduction(totalRevenue)
    : 0;

  let assigned = 0;

  return entries.map((entry, i) => {
    let deductionAmount: number;

    if (entries.length === 1 || totalRevenue === 0) {
      deductionAmount = totalDeduction;
    } else if (i === entries.length - 1) {
      deductionAmount = totalDeduction - assigned;
    } else {
      deductionAmount = Math.floor(totalDeduction * (entry.amount / totalRevenue));
      assigned += deductionAmount;
    }

    return {
      type: entry.type,
      revenue: entry.amount,
      deduction_amount: deductionAmount,
      deduction_label: "給与所得控除",
      income_amount: Math.max(0, entry.amount - deductionAmount),
    };
  });
};
