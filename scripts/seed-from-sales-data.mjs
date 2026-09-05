import fs from "node:fs/promises";
import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

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

const sql = neon(process.env.DATABASE_URL);
for (const row of rows) {
  await sql`
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

await sql`
  insert into sync_runs (status, started_at, finished_at, changed_months, record_count, qa, summary_text)
  values ('published', now(), now(), ${JSON.stringify([...new Set(rows.map((row) => row.month))].sort())}::jsonb, ${rows.length}, '{"issues":[]}'::jsonb, ${`initial seed from sales-data.js: ${rows.length} records`})
`;

console.log(`Seeded ${rows.length} dashboard records.`);
