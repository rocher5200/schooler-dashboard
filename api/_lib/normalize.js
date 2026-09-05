import crypto from "node:crypto";
import * as XLSX from "xlsx";

const HEADER_ALIASES = {
  code: ["培訓代碼", "課程代碼", "代碼", "code"],
  course: ["培訓課程", "課程名稱", "課程", "course"],
  price: ["售價", "定價", "單價", "price"],
  quantity: ["銷售數量", "數量", "購買數量", "quantity", "qty"],
  paid: ["繳費金額", "付款金額", "業績", "金額", "paid"],
  refunds: ["退費金額", "退款金額", "refund", "refunds"]
};

export function normalizeWorkbooks({ salesWorkbook, refundsWorkbook }) {
  const salesRows = parseWorkbook(salesWorkbook, "sales");
  const refundRows = parseWorkbook(refundsWorkbook, "refunds");
  const refundMap = new Map();

  for (const row of refundRows) {
    const key = recordKey(row);
    refundMap.set(key, (refundMap.get(key) || 0) + Math.abs(row.refunds || row.paid || 0));
  }

  const records = salesRows.map((row) => {
    const refunds = refundMap.get(recordKey(row)) || 0;
    const normalized = {
      month: row.month,
      code: row.code,
      course: row.course,
      price: row.price,
      quantity: row.quantity,
      paid: row.paid,
      refunds
    };
    return { ...normalized, sourceHash: hashRecord(normalized) };
  });

  for (const row of refundRows) {
    if (salesRows.some((sales) => recordKey(sales) === recordKey(row))) continue;
    const normalized = {
      month: row.month,
      code: row.code,
      course: row.course,
      price: row.price || 0,
      quantity: 0,
      paid: 0,
      refunds: Math.abs(row.refunds || row.paid || 0)
    };
    records.push({ ...normalized, sourceHash: hashRecord(normalized) });
  }

  return dedupeRecords(records);
}

export function runQa(records) {
  const issues = [];
  const seen = new Set();
  const byMonth = new Map();

  for (const row of records) {
    const key = `${row.month}::${row.code}::${row.course}`;
    if (seen.has(key)) issues.push(blocking("duplicate_record", "資料重複", `${row.month} ${row.code} ${row.course} 重複出現`));
    seen.add(key);

    if (!/^\d{4}-\d{2}$/.test(row.month)) issues.push(blocking("invalid_month", "月份格式錯誤", `${row.course} 的月份不是 YYYY-MM 格式`));
    if (!row.code) issues.push(blocking("missing_code", "缺少培訓代碼", `${row.month} ${row.course} 缺少培訓代碼`));
    if (!row.course) issues.push(blocking("missing_course", "缺少課程名稱", `${row.month} ${row.code} 缺少課程名稱`));
    if (row.quantity < 0) issues.push(blocking("negative_quantity", "銷售數量為負數", `${row.month} ${row.code} 的銷售數量為 ${row.quantity}`));
    if (row.paid < 0 && row.price > 0) issues.push(warning("negative_paid", "繳費金額為負數", `${row.month} ${row.code} 的繳費金額為 ${row.paid}`));
    if (row.refunds > row.paid && row.paid > 0) issues.push(warning("refund_gt_paid", "退費高於業績", `${row.month} ${row.code} 退費 ${row.refunds} 高於繳費 ${row.paid}`));

    const month = byMonth.get(row.month) || { paid: 0, refunds: 0 };
    month.paid += row.paid;
    month.refunds += row.refunds;
    byMonth.set(row.month, month);
  }

  for (const [month, totals] of byMonth.entries()) {
    if (totals.paid > 0 && totals.refunds / totals.paid > 0.5) {
      issues.push(blocking("month_refund_rate_high", "月份退費率過高", `${month} 退費率超過 50%，請先確認 Excel 資料`));
    }
  }

  return { issues, blocking: issues.some((issue) => issue.severity === "blocking") };
}

function parseWorkbook(workbook, kind) {
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const month = inferMonth(sheetName);
    if (!month) continue;

    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    for (const raw of rawRows) {
      const row = normalizeRow(raw, month, kind);
      if (!row.code && !row.course) continue;
      rows.push(row);
    }
  }
  return rows;
}

function normalizeRow(raw, month, kind) {
  const get = (field) => {
    const aliases = HEADER_ALIASES[field];
    const key = Object.keys(raw).find((candidate) => aliases.some((alias) => normalizeHeader(candidate) === normalizeHeader(alias)));
    return key ? raw[key] : "";
  };

  return {
    month,
    code: text(get("code")),
    course: text(get("course")),
    price: amount(get("price")),
    quantity: amount(get("quantity")),
    paid: kind === "sales" ? amount(get("paid")) : 0,
    refunds: kind === "refunds" ? amount(get("refunds") || get("paid")) : 0
  };
}

function dedupeRecords(records) {
  const map = new Map();
  for (const row of records) {
    const key = recordKey(row);
    const current = map.get(key) || { ...row, quantity: 0, paid: 0, refunds: 0 };
    current.price = row.price || current.price || 0;
    current.quantity += row.quantity;
    current.paid += row.paid;
    current.refunds += row.refunds;
    current.sourceHash = hashRecord(current);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month) || a.code.localeCompare(b.code) || a.course.localeCompare(b.course));
}

function inferMonth(sheetName) {
  const normalized = String(sheetName).trim();
  const match = normalized.match(/(20\d{2})\D?(0?[1-9]|1[0-2])/);
  if (!match) return null;
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
}

function recordKey(row) { return `${row.month}::${row.code}::${row.course}`; }
function hashRecord(row) { return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex"); }
function normalizeHeader(value) { return String(value).trim().toLowerCase().replace(/\s+/g, ""); }
function text(value) { return String(value ?? "").trim(); }
function amount(value) {
  if (typeof value === "number") return Math.round(value);
  const cleaned = String(value ?? "").replace(/[,，$NTDntd\s]/g, "").trim();
  const parsed = Number(cleaned || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
function blocking(code, title, message) { return { severity: "blocking", code, title, message }; }
function warning(code, title, message) { return { severity: "warning", code, title, message }; }
