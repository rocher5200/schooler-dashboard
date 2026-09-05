import { getDashboardRows, recordSyncRun, replaceChangedMonths } from "./db.js";
import { loadDriveWorkbook } from "./google-drive.js";
import { normalizeWorkbooks, runQa } from "./normalize.js";

export async function buildPreview() {
  const startedAt = new Date().toISOString();
  try {
    const [salesWorkbook, refundsWorkbook, currentRows] = await Promise.all([
      loadDriveWorkbook(process.env.GOOGLE_DRIVE_SALES_FILE_ID),
      loadDriveWorkbook(process.env.GOOGLE_DRIVE_REFUNDS_FILE_ID),
      getDashboardRows()
    ]);

    const incomingRows = normalizeWorkbooks({ salesWorkbook, refundsWorkbook });
    const summary = compareRows(currentRows, incomingRows);
    const qa = runQa(incomingRows);
    const status = qa.blocking ? "blocked" : "previewed";

    await safeRecordSyncRun({ status, startedAt, finishedAt: new Date().toISOString(), summary, qa });

    return {
      startedAt,
      blocking: qa.blocking,
      summary,
      qa
    };
  } catch (error) {
    await safeRecordSyncRun({
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: {},
      qa: { issues: [] },
      error: error.message || "同步預覽失敗"
    });
    throw error;
  }
}

export async function publishLatestDriveData() {
  const startedAt = new Date().toISOString();
  try {
    const [salesWorkbook, refundsWorkbook, currentRows] = await Promise.all([
      loadDriveWorkbook(process.env.GOOGLE_DRIVE_SALES_FILE_ID),
      loadDriveWorkbook(process.env.GOOGLE_DRIVE_REFUNDS_FILE_ID),
      getDashboardRows()
    ]);

    const incomingRows = normalizeWorkbooks({ salesWorkbook, refundsWorkbook });
    const summary = compareRows(currentRows, incomingRows);
    const qa = runQa(incomingRows);

    if (qa.blocking) {
      await safeRecordSyncRun({ status: "blocked", startedAt, finishedAt: new Date().toISOString(), summary, qa });
      const error = new Error("QA 發現重大異常，正式資料未更新");
      error.statusCode = 422;
      error.payload = { blocking: true, summary, qa };
      throw error;
    }

    await replaceChangedMonths(incomingRows, summary.changedMonths);
    await safeRecordSyncRun({ status: "published", startedAt, finishedAt: new Date().toISOString(), summary, qa });

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      blocking: false,
      summary,
      qa
    };
  } catch (error) {
    if (!error.payload?.blocking) {
      await safeRecordSyncRun({
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        summary: {},
        qa: { issues: [] },
        error: error.message || "同步發布失敗"
      });
    }
    throw error;
  }
}

export function compareRows(currentRows, incomingRows) {
  const currentMap = new Map(currentRows.map((row) => [recordKey(row), normalizeComparable(row)]));
  const incomingMap = new Map(incomingRows.map((row) => [recordKey(row), normalizeComparable(row)]));
  const currentMonths = new Set(currentRows.map((row) => row.month));
  const incomingMonths = new Set(incomingRows.map((row) => row.month));
  const changedMonths = new Set();
  const addedMonths = [...incomingMonths].filter((month) => !currentMonths.has(month)).sort();
  const currentCourses = new Set(currentRows.map((row) => `${row.code}::${row.course}`));
  const newCourses = [];

  for (const [key, incoming] of incomingMap.entries()) {
    const current = currentMap.get(key);
    const [month, code, course] = key.split("::");
    if (!current || JSON.stringify(current) !== JSON.stringify(incoming)) changedMonths.add(month);
    if (!currentCourses.has(`${code}::${course}`)) newCourses.push({ code, course });
  }

  for (const key of currentMap.keys()) {
    if (!incomingMap.has(key)) changedMonths.add(key.split("::")[0]);
  }

  const currentTotals = totals(currentRows);
  const incomingTotals = totals(incomingRows);

  return {
    addedMonths,
    changedMonths: [...changedMonths].sort(),
    newCourses,
    newCourseCount: newCourses.length,
    paidDelta: incomingTotals.paid - currentTotals.paid,
    refundDelta: incomingTotals.refunds - currentTotals.refunds,
    netPaidDelta: incomingTotals.netPaid - currentTotals.netPaid,
    recordCount: incomingRows.length
  };
}

async function safeRecordSyncRun(payload) {
  try {
    await recordSyncRun(payload);
  } catch (recordError) {
    console.error("Unable to write sync run record", recordError);
  }
}

function totals(rows) {
  return rows.reduce((sum, row) => {
    const paid = Number(row.paid) || 0;
    const refunds = Number(row.refunds) || 0;
    sum.paid += paid;
    sum.refunds += refunds;
    sum.netPaid += paid - refunds;
    return sum;
  }, { paid: 0, refunds: 0, netPaid: 0 });
}

function normalizeComparable(row) {
  return {
    month: row.month,
    code: row.code,
    course: row.course,
    price: Number(row.price) || 0,
    quantity: Number(row.quantity) || 0,
    paid: Number(row.paid) || 0,
    refunds: Number(row.refunds) || 0
  };
}

function recordKey(row) { return `${row.month}::${row.code}::${row.course}`; }
