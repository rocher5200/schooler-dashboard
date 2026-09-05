import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { normalizeWorkbooks, runQa } from "../api/_lib/normalize.js";
import { compareRows } from "../api/_lib/sync-service.js";

function workbook(sheetName, rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), sheetName);
  return book;
}

const salesWorkbook = workbook("2026年09月", [
  { "培訓代碼": "9001", "培訓課程": "菜鳥救星-測試課程", "售價": 3000, "銷售數量": 2, "繳費金額": 6000 },
  { "培訓代碼": "9002", "培訓課程": "菜鳥救星-(影)測試影音", "售價": 2000, "銷售數量": 1, "繳費金額": 2000 }
]);
const refundsWorkbook = workbook("2026-09", [
  { "培訓代碼": "9001", "培訓課程": "菜鳥救星-測試課程", "退費金額": 1000 }
]);

const records = normalizeWorkbooks({ salesWorkbook, refundsWorkbook });
assert.equal(records.length, 2);
assert.equal(records.find((row) => row.code === "9001").refunds, 1000);
assert.equal(runQa(records).blocking, false);

const summary = compareRows([], records);
assert.deepEqual(summary.addedMonths, ["2026-09"]);
assert.equal(summary.newCourseCount, 2);
assert.equal(summary.paidDelta, 8000);
assert.equal(summary.refundDelta, 1000);
assert.equal(summary.netPaidDelta, 7000);

console.log("Normalization smoke test passed.");
