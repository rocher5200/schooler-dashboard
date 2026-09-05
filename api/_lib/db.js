import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth.js";

const RECORDS_SHEET = "DashboardRecords";
const RUNS_SHEET = "SyncRuns";
const RECORD_HEADERS = ["month", "code", "course", "price", "quantity", "paid", "refunds", "source_hash", "updated_at"];
const RUN_HEADERS = ["id", "status", "started_at", "finished_at", "added_months", "changed_months", "new_courses", "paid_delta", "refund_delta", "net_paid_delta", "record_count", "qa", "error", "summary_text"];

let sheetsClient;

function sheets() {
  if (!process.env.FORMAL_DATA_SPREADSHEET_ID) {
    throw new Error("FORMAL_DATA_SPREADSHEET_ID 尚未設定");
  }
  if (!sheetsClient) {
    const auth = getGoogleAuth(["https://www.googleapis.com/auth/spreadsheets"]);
    sheetsClient = google.sheets({ version: "v4", auth });
  }
  return sheetsClient;
}

export async function getDashboardRows() {
  await ensureFormalSheets();
  const values = await readValues(RECORDS_SHEET);
  return valuesToObjects(values, RECORD_HEADERS).map((row) => ({
    month: row.month,
    code: row.code,
    course: row.course,
    price: integer(row.price),
    quantity: integer(row.quantity),
    paid: integer(row.paid),
    refunds: integer(row.refunds),
    netPaid: integer(row.paid) - integer(row.refunds),
    sourceHash: row.source_hash || ""
  })).sort((a, b) => a.month.localeCompare(b.month) || a.code.localeCompare(b.code) || a.course.localeCompare(b.course));
}

export async function getLastSync() {
  const runs = await getSyncHistory(50);
  return runs.find((run) => run.status === "published") || null;
}

export async function getSyncHistory(limit = 10) {
  await ensureFormalSheets();
  const values = await readValues(RUNS_SHEET);
  return valuesToObjects(values, RUN_HEADERS)
    .map((row) => ({
      id: row.id,
      status: row.status,
      started_at: row.started_at,
      finished_at: row.finished_at,
      summary_text: row.summary_text,
      qa: parseJson(row.qa, { issues: [] }),
      error: row.error || null
    }))
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
    .slice(0, limit);
}

export async function recordSyncRun({ status, startedAt, finishedAt, summary = {}, qa, error }) {
  await ensureFormalSheets();
  const summaryText = buildSummaryText(status, summary, qa, error);
  const id = `${Date.now()}`;
  await sheets().spreadsheets.values.append({
    spreadsheetId: process.env.FORMAL_DATA_SPREADSHEET_ID,
    range: `${RUNS_SHEET}!A:N`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        id,
        status,
        startedAt,
        finishedAt || "",
        JSON.stringify(summary.addedMonths || []),
        JSON.stringify(summary.changedMonths || []),
        JSON.stringify(summary.newCourses || []),
        summary.paidDelta || 0,
        summary.refundDelta || 0,
        summary.netPaidDelta || 0,
        summary.recordCount || 0,
        JSON.stringify(qa || { issues: [] }),
        error || "",
        summaryText
      ]]
    }
  });
  return { id };
}

export async function replaceChangedMonths(rows, changedMonths) {
  const months = [...new Set(changedMonths || [])].sort();
  if (!months.length) return;

  await ensureFormalSheets();
  const currentRows = await getDashboardRows();
  const nextRows = [
    ...currentRows.filter((row) => !months.includes(row.month)),
    ...rows.filter((row) => months.includes(row.month))
  ].sort((a, b) => a.month.localeCompare(b.month) || a.code.localeCompare(b.code) || a.course.localeCompare(b.course));

  const values = [RECORD_HEADERS, ...nextRows.map((row) => [
    row.month,
    row.code,
    row.course,
    integer(row.price),
    integer(row.quantity),
    integer(row.paid),
    integer(row.refunds),
    row.sourceHash || row.source_hash || "",
    new Date().toISOString()
  ])];

  await sheets().spreadsheets.values.update({
    spreadsheetId: process.env.FORMAL_DATA_SPREADSHEET_ID,
    range: `${RECORDS_SHEET}!A1:I${values.length}`,
    valueInputOption: "RAW",
    requestBody: { values }
  });

  await sheets().spreadsheets.values.clear({
    spreadsheetId: process.env.FORMAL_DATA_SPREADSHEET_ID,
    range: `${RECORDS_SHEET}!A${values.length + 1}:I20000`
  });
}

async function ensureFormalSheets() {
  const spreadsheetId = process.env.FORMAL_DATA_SPREADSHEET_ID;
  const client = sheets();
  const metadata = await client.spreadsheets.get({ spreadsheetId });
  const existing = new Set((metadata.data.sheets || []).map((sheet) => sheet.properties.title));
  const requests = [];

  if (!existing.has(RECORDS_SHEET)) requests.push({ addSheet: { properties: { title: RECORDS_SHEET } } });
  if (!existing.has(RUNS_SHEET)) requests.push({ addSheet: { properties: { title: RUNS_SHEET } } });

  if (requests.length) {
    await client.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  await ensureHeader(RECORDS_SHEET, RECORD_HEADERS);
  await ensureHeader(RUNS_SHEET, RUN_HEADERS);
}

async function ensureHeader(sheetName, headers) {
  const values = await readValues(sheetName);
  const firstRow = values[0] || [];
  const headerOk = headers.every((header, index) => firstRow[index] === header);
  if (headerOk) return;

  await sheets().spreadsheets.values.update({
    spreadsheetId: process.env.FORMAL_DATA_SPREADSHEET_ID,
    range: `${sheetName}!A1:${columnName(headers.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] }
  });
}

async function readValues(sheetName) {
  const response = await sheets().spreadsheets.values.get({
    spreadsheetId: process.env.FORMAL_DATA_SPREADSHEET_ID,
    range: `${sheetName}!A:Z`
  });
  return response.data.values || [];
}

function valuesToObjects(values, headers) {
  return values.slice(1).filter((row) => row.some((cell) => String(cell || "").trim())).map((row) => {
    const item = {};
    headers.forEach((header, index) => { item[header] = row[index] ?? ""; });
    return item;
  });
}

function buildSummaryText(status, summary, qa, error) {
  if (error) return error;
  const blockingCount = (qa?.issues || []).filter((issue) => issue.severity === "blocking").length;
  const parts = [
    `新增月份 ${summary.addedMonths?.length || 0}`,
    `修改月份 ${summary.changedMonths?.length || 0}`,
    `新增課程 ${summary.newCourseCount || 0}`,
    `淨業績變化 ${summary.netPaidDelta || 0}`
  ];
  if (blockingCount) parts.push(`重大異常 ${blockingCount}`);
  return `${status}: ${parts.join("，")}`;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function integer(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function columnName(length) {
  let dividend = length;
  let name = "";
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return name;
}
