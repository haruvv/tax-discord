import type { IncomeCalculator, IncomeDetail, IncomeEntry } from "../types.js";

export const calcTemporaryIncome: IncomeCalculator = (
  entries: IncomeEntry[],
): IncomeDetail[] => {
  const rawNets = entries.map((e) => e.amount - (e.expenses ?? 0));
  const totalRawNet = rawNets.reduce((s, n) => s + n, 0);
  const adjustedTotal = Math.max(0, totalRawNet - 500_000) / 2;

  const details: IncomeDetail[] = entries.map((entry) => ({
    type: entry.type,
    revenue: entry.amount,
    deduction_amount: entry.expenses ?? 0,
    deduction_label: "必要経費",
    income_amount: 0,
  }));

  if (adjustedTotal === 0 || totalRawNet <= 0) {
    return details;
  }

  const positiveNets = rawNets.map((n) => Math.max(0, n));
  const totalPositive = positiveNets.reduce((s, n) => s + n, 0);

  let lastPositiveIdx = -1;
  for (let j = details.length - 1; j >= 0; j--) {
    if (positiveNets[j] > 0) { lastPositiveIdx = j; break; }
  }

  let assigned = 0;
  for (let i = 0; i < details.length; i++) {
    if (totalPositive > 0 && positiveNets[i] > 0) {
      if (i === lastPositiveIdx) {
        details[i].income_amount = Math.floor(adjustedTotal) - assigned;
      } else {
        const share = Math.floor(adjustedTotal * (positiveNets[i] / totalPositive));
        details[i].income_amount = share;
        assigned += share;
      }
    }
  }

  return details;
};
