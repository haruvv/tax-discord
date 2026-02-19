import { rules2025 } from "./tax-rules/2025.js";
import type { IncomeCalculator, IncomeDetail, IncomeEntry, TaxRules } from "./tax-rules/types.js";
import { calcSalaryIncome } from "./tax-rules/income/salary.js";
import { calcMiscIncome } from "./tax-rules/income/misc.js";
import { calcTemporaryIncome } from "./tax-rules/income/temporary.js";

// --- ルールレジストリ ---
const RULES_BY_YEAR: Record<number, TaxRules> = {
  2025: rules2025,
};

// --- 入力型 ---
interface CalcTaxInput {
  tax_year: number;
  income: {
    type: "給与所得" | "雑所得" | "一時所得";
    amount: number;
    withholding_tax?: number;
    social_insurance?: number;
    expenses?: number;
  }[];
  deductions: {
    type: string;
    amount: number;
  }[];
}

// --- 出力型 ---
interface CalcTaxOutput {
  income_details: {
    type: string;
    revenue: number;
    deduction_amount: number;
    deduction_label: string;
    income_amount: number;
  }[];
  total_income: number;
  deduction_details: {
    type: string;
    amount: number;
  }[];
  basic_deduction: number;
  total_deductions: number;
  taxable_income: number;
  income_tax: number;
  reconstruction_tax: number;
  total_tax: number;
  total_withholding: number;
  tax_due: number;
  breakdown: {
    salary_deduction: string;
    basic_deduction: string;
    tax_bracket: string;
    reconstruction: string;
  };
}

// --- バリデーション ---
function validate(data: unknown): CalcTaxInput {
  if (typeof data !== "object" || data === null) {
    throw new Error("入力が JSON オブジェクトではありません");
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.tax_year !== "number") {
    throw new Error("tax_year は数値で指定してください");
  }
  if (!Array.isArray(obj.income)) {
    throw new Error("income は配列で指定してください");
  }

  for (let i = 0; i < obj.income.length; i++) {
    const entry = obj.income[i] as Record<string, unknown>;
    if (!["給与所得", "雑所得", "一時所得"].includes(entry.type as string)) {
      throw new Error(`income[${i}].type が不正です: ${String(entry.type)}`);
    }
    if (typeof entry.amount !== "number") {
      throw new Error(`income[${i}].amount は数値で指定してください`);
    }
    for (const field of ["withholding_tax", "social_insurance", "expenses"] as const) {
      if (field in entry && typeof entry[field] !== "number") {
        throw new Error(`income[${i}].${field} は数値で指定してください`);
      }
    }
  }

  if (!Array.isArray(obj.deductions)) {
    throw new Error("deductions は配列で指定してください");
  }

  for (let i = 0; i < obj.deductions.length; i++) {
    const entry = obj.deductions[i] as Record<string, unknown>;
    if (typeof entry.type !== "string") {
      throw new Error(`deductions[${i}].type は文字列で指定してください`);
    }
    if (typeof entry.amount !== "number") {
      throw new Error(`deductions[${i}].amount は数値で指定してください`);
    }
  }

  return data as CalcTaxInput;
}

// --- 数値フォーマット ---
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

// --- 所得種類別 calculator レジストリ ---
const INCOME_CALCULATORS: Record<string, IncomeCalculator> = {
  "給与所得": calcSalaryIncome,
  "雑所得": calcMiscIncome,
  "一時所得": calcTemporaryIncome,
};

// --- 所得金額計算 ---
function calcIncomeDetails(
  input: CalcTaxInput,
  rules: TaxRules,
): CalcTaxOutput["income_details"] {
  // 入力エントリを type でグループ化（元の順序インデックスを保持）
  const groups = new Map<string, { index: number; entry: IncomeEntry }[]>();
  for (let i = 0; i < input.income.length; i++) {
    const entry = input.income[i];
    const group = groups.get(entry.type) ?? [];
    group.push({ index: i, entry });
    groups.set(entry.type, group);
  }

  // 各グループを対応する calculator に渡す
  const results: { index: number; detail: IncomeDetail }[] = [];
  for (const [type, items] of groups) {
    const calculator = INCOME_CALCULATORS[type];
    if (!calculator) {
      throw new Error(`未対応の所得種類: ${type}`);
    }
    const entries = items.map((item) => item.entry);
    const details = calculator(entries, rules);
    for (let j = 0; j < items.length; j++) {
      results.push({ index: items[j].index, detail: details[j] });
    }
  }

  // 元の順序で再構成
  results.sort((a, b) => a.index - b.index);
  return results.map((r) => r.detail);
}

// --- breakdown 生成 ---
function buildSalaryBreakdown(
  incomeDetails: CalcTaxOutput["income_details"],
): string {
  const salaries = incomeDetails.filter((d) => d.type === "給与所得");
  if (salaries.length === 0) return "給与所得なし";

  const totalRevenue = salaries.reduce((s, d) => s + d.revenue, 0);
  const totalDeduction = salaries.reduce((s, d) => s + d.deduction_amount, 0);
  const totalIncome = salaries.reduce((s, d) => s + d.income_amount, 0);

  return `${fmt(totalRevenue)} → 給与所得控除 ${fmt(totalDeduction)} → 所得 ${fmt(totalIncome)}`;
}

function buildBasicBreakdown(totalIncome: number, basicDeduction: number): string {
  return `合計所得 ${fmt(totalIncome)} → 基礎控除 ${fmt(basicDeduction)}`;
}

function buildTaxBracketBreakdown(taxableIncome: number, incomeTax: number): string {
  return `課税所得 ${fmt(taxableIncome)} → 所得税 ${fmt(incomeTax)}`;
}

function buildReconstructionBreakdown(incomeTax: number, reconstructionTax: number): string {
  return `${fmt(incomeTax)} × 2.1% = ${fmt(reconstructionTax)}`;
}

// --- メイン計算 ---
function calculate(input: CalcTaxInput, rules: TaxRules): CalcTaxOutput {
  // 所得詳細
  const incomeDetails = calcIncomeDetails(input, rules);
  const totalIncome = incomeDetails.reduce((sum, d) => sum + d.income_amount, 0);

  // 基礎控除
  const basicDeduction = rules.calcBasicDeduction(totalIncome);

  // income から社会保険料を集計
  const socialInsurance = input.income.reduce(
    (sum, e) => sum + (e.social_insurance ?? 0),
    0,
  );

  // 控除詳細
  const deductionDetails = [
    { type: "基礎控除", amount: basicDeduction },
    ...(socialInsurance > 0
      ? [{ type: "社会保険料控除（源泉）", amount: socialInsurance }]
      : []),
    ...input.deductions,
  ];
  const totalDeductions = deductionDetails.reduce((sum, d) => sum + d.amount, 0);

  // 課税所得金額（1,000円未満切捨て）
  const taxableIncome = rules.rounding.taxableIncome(
    Math.max(0, totalIncome - totalDeductions),
  );

  // 所得税（100円未満切捨て）
  const incomeTax = rules.rounding.incomeTax(rules.calcIncomeTax(taxableIncome));

  // 復興特別所得税（1円未満切捨て）
  const reconstructionTax = rules.rounding.reconstructionTax(incomeTax * 0.021);

  // 合計税額
  const totalTax = incomeTax + reconstructionTax;

  // 源泉徴収済み合算
  const totalWithholding = input.income.reduce(
    (sum, e) => sum + (e.withholding_tax ?? 0),
    0,
  );

  // 差引納付/還付
  const taxDue = totalTax - totalWithholding;

  return {
    income_details: incomeDetails,
    total_income: totalIncome,
    deduction_details: deductionDetails,
    basic_deduction: basicDeduction,
    total_deductions: totalDeductions,
    taxable_income: taxableIncome,
    income_tax: incomeTax,
    reconstruction_tax: reconstructionTax,
    total_tax: totalTax,
    total_withholding: totalWithholding,
    tax_due: taxDue,
    breakdown: {
      salary_deduction: buildSalaryBreakdown(incomeDetails),
      basic_deduction: buildBasicBreakdown(totalIncome, basicDeduction),
      tax_bracket: buildTaxBracketBreakdown(taxableIncome, incomeTax),
      reconstruction: buildReconstructionBreakdown(incomeTax, reconstructionTax),
    },
  };
}

// --- stdin 読み込み ---
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}

// --- エントリポイント ---
async function main(): Promise<void> {
  const raw = await readStdin();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write("入力が有効な JSON ではありません\n");
    process.exit(1);
  }

  let input: CalcTaxInput;
  try {
    input = validate(parsed);
  } catch (err: unknown) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  const rules = RULES_BY_YEAR[input.tax_year];
  if (!rules) {
    process.stderr.write(`tax_year ${input.tax_year} は未対応です\n`);
    process.exit(2);
  }

  const output = calculate(input, rules);
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`予期しないエラー: ${(err as Error).message}\n`);
  process.exit(1);
});
