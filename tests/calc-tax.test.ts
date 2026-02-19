import { describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

function runCalcTax(input: object): Promise<Record<string, unknown>> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/calc-tax.ts"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));

    child.on("error", fail);
    child.on("close", (code) => {
      if (code !== 0) {
        fail(new Error(`exit ${code}: ${Buffer.concat(err).toString()}`));
        return;
      }
      ok(JSON.parse(Buffer.concat(out).toString()) as Record<string, unknown>);
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

describe("calc-tax.ts 統合テスト", () => {
  test("給与のみ", { timeout: 15_000 }, async () => {
    const result = await runCalcTax({
      tax_year: 2025,
      income: [
        {
          type: "給与所得",
          amount: 5_000_000,
          withholding_tax: 120_000,
          social_insurance: 700_000,
        },
      ],
      deductions: [],
    });

    expect(result.total_income).toBeTypeOf("number");
    expect(result.taxable_income).toBeTypeOf("number");
    expect(result.income_tax).toBeTypeOf("number");
    expect(result.reconstruction_tax).toBeTypeOf("number");
    expect(result.total_tax).toBeTypeOf("number");
    expect(result.total_withholding).toBe(120_000);

    // 給与収入 500万 → 控除 500万*0.2+44万 = 144万 → 所得 356万
    expect(result.total_income).toBe(3_560_000);

    // 基礎控除: 合計所得 356万 → 68万(336万超489万以下)
    // 控除合計: 68万 + 70万(社保) = 138万
    // 課税所得: 356万 - 138万 = 218万 → 1,000円未満切捨て → 218万
    expect(result.taxable_income).toBe(2_180_000);

    // 所得税: 218万 * 0.1 - 97,500 = 120,500 → 100円未満切捨て → 120,500
    expect(result.income_tax).toBe(120_500);
  });

  test("混合所得（給与 + 雑 + 一時）", { timeout: 15_000 }, async () => {
    const result = await runCalcTax({
      tax_year: 2025,
      income: [
        {
          type: "給与所得",
          amount: 4_000_000,
          withholding_tax: 80_000,
          social_insurance: 500_000,
        },
        {
          type: "雑所得",
          amount: 500_000,
          expenses: 100_000,
        },
        {
          type: "一時所得",
          amount: 1_500_000,
          expenses: 200_000,
        },
      ],
      deductions: [{ type: "生命保険料控除", amount: 40_000 }],
    });

    expect(result.total_withholding).toBe(80_000);

    // 給与所得: 400万 → 控除 400万*0.2+44万 = 124万 → 所得 276万
    // 雑所得:   50万 - 10万 = 40万
    // 一時所得: 150万 - 20万 = 130万 → (130万-50万)/2 = 40万
    // 合計所得: 276万 + 40万 + 40万 = 356万
    expect(result.total_income).toBe(3_560_000);

    const details = result.income_details as Array<{
      type: string;
      income_amount: number;
    }>;
    expect(details).toHaveLength(3);
    expect(details[0].income_amount).toBe(2_760_000); // 給与
    expect(details[1].income_amount).toBe(400_000); // 雑
    expect(details[2].income_amount).toBe(400_000); // 一時

    // breakdown が含まれていること
    expect(result.breakdown).toBeDefined();
    const breakdown = result.breakdown as Record<string, string>;
    expect(breakdown.salary_deduction).toContain("給与所得控除");
  });
});
