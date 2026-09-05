import { neon } from "@neondatabase/serverless";

let client;

export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 尚未設定");
  }
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function getDashboardRows() {
  return sql()`
    select month, code, course, price, quantity, paid, refunds, net_paid as "netPaid"
    from dashboard_records
    order by month asc, code asc, course asc
  `;
}

export async function getLastSync() {
  const rows = await sql()`
    select id, status, started_at, finished_at, summary_text
    from sync_runs
    where status = 'published'
    order by started_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function getSyncHistory(limit = 10) {
  return sql()`
    select id, status, started_at, finished_at, summary_text, qa, error
    from sync_runs
    order by started_at desc
    limit ${limit}
  `;
}

export async function recordSyncRun({ status, startedAt, finishedAt, summary, qa, error }) {
  const summaryText = buildSummaryText(status, summary, qa, error);
  const rows = await sql()`
    insert into sync_runs (
      status, started_at, finished_at, added_months, changed_months, new_courses,
      paid_delta, refund_delta, net_paid_delta, record_count, qa, error, summary_text
    ) values (
      ${status}, ${startedAt}, ${finishedAt || null}, ${JSON.stringify(summary.addedMonths || [])}::jsonb,
      ${JSON.stringify(summary.changedMonths || [])}::jsonb, ${JSON.stringify(summary.newCourses || [])}::jsonb,
      ${summary.paidDelta || 0}, ${summary.refundDelta || 0}, ${summary.netPaidDelta || 0},
      ${summary.recordCount || 0}, ${JSON.stringify(qa || { issues: [] })}::jsonb, ${error || null}, ${summaryText}
    ) returning id
  `;
  return rows[0];
}

export async function replaceChangedMonths(rows, changedMonths) {
  const database = sql();
  for (const month of changedMonths) {
    await database`delete from dashboard_records where month = ${month}`;
  }

  for (const row of rows.filter((item) => changedMonths.includes(item.month))) {
    await database`
      insert into dashboard_records (month, code, course, price, quantity, paid, refunds, source_hash, updated_at)
      values (${row.month}, ${row.code}, ${row.course}, ${row.price}, ${row.quantity}, ${row.paid}, ${row.refunds}, ${row.sourceHash}, now())
      on conflict (month, code, course) do update set
        price = excluded.price,
        quantity = excluded.quantity,
        paid = excluded.paid,
        refunds = excluded.refunds,
        source_hash = excluded.source_hash,
        updated_at = now()
    `;
  }
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
