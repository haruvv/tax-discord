import type { TaxRules } from "./types.js";

// 給与所得控除（令和7年分以降）
// https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
function calcSalaryDeduction(revenue: number): number {
  if (revenue <= 1_900_000) return 650_000;
  if (revenue <= 3_600_000) return Math.floor(revenue * 0.3 + 80_000);
  if (revenue <= 6_600_000) return Math.floor(revenue * 0.2 + 440_000);
  if (revenue <= 8_500_000) return Math.floor(revenue * 0.1 + 1_100_000);
  return 1_950_000;
}

// 基礎控除（令和7年分）— 基礎控除の特例を含む
// https://www.nta.go.jp/users/gensen/2025kiso/index.htm
function calcBasicDeduction(totalIncome: number): number {
  if (totalIncome <= 1_320_000) return 950_000;
  if (totalIncome <= 3_360_000) return 880_000;
  if (totalIncome <= 4_890_000) return 680_000;
  if (totalIncome <= 6_550_000) return 630_000;
  if (totalIncome <= 23_500_000) return 580_000;
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
