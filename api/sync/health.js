import { requireSyncAuth, handleApiError, sendJson } from "../_lib/auth.js";

const REQUIRED_ENV = [
  "FORMAL_DATA_SPREADSHEET_ID",
  "DASHBOARD_VIEW_TOKEN",
  "SYNC_ADMIN_TOKEN",
  "GOOGLE_DRIVE_SALES_FILE_ID",
  "GOOGLE_DRIVE_REFUNDS_FILE_ID",
  "GOOGLE_SERVICE_ACCOUNT_JSON"
];

export default async function handler(request, response) {
  try {
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
    requireSyncAuth(request);

    const checks = REQUIRED_ENV.map((name) => ({
      name,
      configured: Boolean(process.env[name])
    }));
    const missing = checks.filter((item) => !item.configured).map((item) => item.name);

    sendJson(response, missing.length ? 500 : 200, {
      ok: missing.length === 0,
      checks,
      missing
    });
  } catch (error) {
    handleApiError(response, error);
  }
}
