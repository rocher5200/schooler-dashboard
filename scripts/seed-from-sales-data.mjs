import fs from "node:fs/promises";
import crypto from "node:crypto";
import { recordSyncRun, replaceChangedMonths } from "../api/_lib/db.js";

if (!process.env.FORMAL_DATA_SPREADSHEET_ID) throw new Error("FORMAL_DATA_SPREADSHEET_ID is required");
if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is required");

const source = await fs.readFile(new URL("../sales-data.js", import.meta.url), "utf8");
const json = source.replace(/^\s*window\.SALES_DATA\s*=\s*/, "").replace(/;\s*$/, "");
const rows = JSON.parse(json).map((row) => {
  const normalized = {
    month: String(row.month || "").trim(),
    code: String(row.code || "").trim(),
    course: String(row.course || "").trim(),
    price: Number(row.price) || 0,
    quantity: Number(row.quantity) || 0,
    paid: Number(row.paid) || 0,
    refunds: 0
  };
  return {
    ...normalized,
    sourceHash: crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
  };
});

const months = [...new Set(rows.map((row) => row.month))].sort();
await replaceChangedMonths(rows, months);
await recordSyncRun({
  status: "published",
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  summary: {
    addedMonths: months,
    changedMonths: months,
    newCourses: [],
    newCourseCount: 0,
    paidDelta: rows.reduce((sum, row) => sum + row.paid, 0),
    refundDelta: 0,
    netPaidDelta: rows.reduce((sum, row) => sum + row.paid, 0),
    recordCount: rows.length
  },
  qa: { issues: [] }
});

console.log(`Seeded ${rows.length} dashboard records into Google Sheets.`);
