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

export async function recordSyncRun({ status, startedAt, finishedAt, summary = {}, qa, error }) {
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
  const months = [...new Set(changedMonths || [])].sort();
  if (!months.length) return;

  const payload = rows
    .filter((item) => months.includes(item.month))
    .map((row) => ({
      month: row.month,
      code: row.code,
      course: row.course,
      price: Number(row.price) || 0,
      quantity: Number(row.quantity) || 0,
      paid: Number(row.paid) || 0,
      refunds: Number(row.refunds) || 0,
      source_hash: row.sourceHash
    }));

  await sql()`
    with changed_months as (
      select jsonb_array_elements_text(${JSON.stringify(months)}::jsonb) as month
    ), deleted as (
      delete from dashboard_records existing
      using changed_months
      where existing.month = changed_months.month
      returning existing.month
    ), incoming as (
      select * from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as row(
        month text,
        code text,
        course text,
        price integer,
        quantity integer,
        paid integer,
        refunds integer,
        source_hash text
      )
    )
    insert into dashboard_records (month, code, course, price, quantity, paid, refunds, source_hash, updated_at)
    select month, code, course, price, quantity, paid, refunds, source_hash, now()
    from incoming
    on conflict (month, code, course) do update set
      price = excluded.price,
      quantity = excluded.quantity,
      paid = excluded.paid,
      refunds = excluded.refunds,
      source_hash = excluded.source_hash,
      updated_at = now()
  `;
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
