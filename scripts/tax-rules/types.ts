export interface TaxRules {
  year: number;
  calcSalaryDeduction: (revenue: number) => number;
  calcBasicDeduction: (totalIncome: number) => number;
  calcIncomeTax: (taxableIncome: number) => number;
  rounding: {
    taxableIncome: (x: number) => number;
    incomeTax: (x: number) => number;
    reconstructionTax: (x: number) => number;
  };
}

export interface IncomeEntry {
  type: string;
  amount: number;
  withholding_tax?: number;
  social_insurance?: number;
  expenses?: number;
}

export interface IncomeDetail {
  type: string;
  revenue: number;
  deduction_amount: number;
  deduction_label: string;
  income_amount: number;
}

export type IncomeCalculator = (
  entries: IncomeEntry[],
  rules: TaxRules,
) => IncomeDetail[];
