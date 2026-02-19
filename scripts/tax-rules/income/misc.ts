import type { IncomeCalculator, IncomeDetail, IncomeEntry } from "../types.js";

export const calcMiscIncome: IncomeCalculator = (
  entries: IncomeEntry[],
): IncomeDetail[] => {
  return entries.map((entry) => {
    const expenses = entry.expenses ?? 0;
    return {
      type: entry.type,
      revenue: entry.amount,
      deduction_amount: expenses,
      deduction_label: "必要経費",
      income_amount: Math.max(0, entry.amount - expenses),
    };
  });
};
