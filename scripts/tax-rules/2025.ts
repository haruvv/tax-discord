import type { TaxRules } from "./types.js";

function calcSalaryDeduction(revenue: number): number {
  if (revenue <= 1_625_000) return 550_000;
  if (revenue <= 1_800_000) return Math.floor(revenue * 0.4 - 100_000);
  if (revenue <= 3_600_000) return Math.floor(revenue * 0.3 + 80_000);
  if (revenue <= 6_600_000) return Math.floor(revenue * 0.2 + 440_000);
  if (revenue <= 8_500_000) return Math.floor(revenue * 0.1 + 1_100_000);
  return 1_950_000;
}

function calcBasicDeduction(totalIncome: number): number {
  if (totalIncome <= 24_000_000) return 480_000;
  if (totalIncome <= 24_500_000) return 320_000;
  if (totalIncome <= 25_000_000) return 160_000;
  return 0;
}

const TAX_BRACKETS: { limit: number; rate: number; deduction: number }[] = [
  { limit: 1_950_000, rate: 0.05, deduction: 0 },
  { limit: 3_300_000, rate: 0.10, deduction: 97_500 },
  { limit: 6_950_000, rate: 0.20, deduction: 427_500 },
  { limit: 9_000_000, rate: 0.23, deduction: 636_000 },
  { limit: 18_000_000, rate: 0.33, deduction: 1_536_000 },
  { limit: 40_000_000, rate: 0.40, deduction: 2_796_000 },
  { limit: Infinity, rate: 0.45, deduction: 4_796_000 },
];

function calcIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  for (const bracket of TAX_BRACKETS) {
    if (taxableIncome <= bracket.limit) {
      return taxableIncome * bracket.rate - bracket.deduction;
    }
  }
  // unreachable (Infinity limit)
  return 0;
}

export const rules2025: TaxRules = {
  year: 2025,
  calcSalaryDeduction,
  calcBasicDeduction,
  calcIncomeTax,
  rounding: {
    taxableIncome: (x) => Math.floor(x / 1_000) * 1_000,
    incomeTax: (x) => Math.floor(x / 100) * 100,
    reconstructionTax: (x) => Math.floor(x),
  },
};
