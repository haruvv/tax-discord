// Claude CLI JSON 出力
export interface ClaudeResponse {
  result: string;
  session_id: string;
  duration_ms: number;
  usage: { input_tokens: number; output_tokens: number };
}

// セッション情報
export interface SessionInfo {
  sessionId: string;
  createdAt: string;
}

// tax_data.json
export interface TaxData {
  tax_year: number;
  profile?: {
    name: string;
    name_kana: string;
    birth_date: string;
    address: string;
    phone?: string;
    occupation?: string;
  };
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  deductions: DeductionEntry[];
  scan_log: ScanLogEntry[];
}

export interface IncomeEntry {
  type: "給与所得" | "雑所得" | "一時所得";
  payer?: string;
  amount: number;
  withholding_tax?: number;
  social_insurance?: number;
  expenses?: number;
  source_file?: string;
}

export interface ExpenseEntry {
  date?: string;
  category: string;
  description: string;
  amount: number;
  source_file?: string;
}

export interface DeductionEntry {
  type: string;
  amount: number;
  description?: string;
  source_file?: string;
}

export interface ScanLogEntry {
  file: string;
  scanned_at: string;
  status: "scanned" | "confirmed" | "rejected";
}
