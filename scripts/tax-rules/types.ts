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
