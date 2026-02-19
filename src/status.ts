import type { TaxData } from "./types.js";

interface CheckItem {
  label: string;
  done: boolean;
}

export function generateChecklist(data: TaxData | null): string {
  const items: CheckItem[] = [];

  // profile
  const profile = data?.profile;
  items.push({ label: "氏名", done: !!profile?.name });
  items.push({ label: "住所", done: !!profile?.address });

  // income
  const incomeCount = data?.income?.length ?? 0;
  items.push({ label: `収入情報（${incomeCount}件登録済み）`, done: incomeCount > 0 });

  // deductions
  const deductionCount = data?.deductions?.length ?? 0;
  items.push({ label: `控除情報（${deductionCount}件登録済み）`, done: deductionCount > 0 });

  // expenses
  const expenseCount = data?.expenses?.length ?? 0;
  items.push({ label: `経費情報（${expenseCount}件登録済み）`, done: expenseCount > 0 });

  // scan_log — 未確認件数
  const scanLog = Array.isArray(data?.scan_log) ? data.scan_log : [];
  const unconfirmed = scanLog.filter((e) => e && e.status === "scanned").length;
  if (unconfirmed > 0) {
    items.push({ label: `未確認の読み取り結果（${unconfirmed}件）`, done: false });
  }

  const lines = items.map((item) => {
    const mark = item.done ? "✅" : "⬜";
    return `${mark} ${item.label}`;
  });

  const doneCount = items.filter((i) => i.done).length;
  const header = `📋 登録状況（${doneCount}/${items.length}）`;

  return [header, "", ...lines].join("\n");
}
