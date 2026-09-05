import { getDashboardRows, getLastSync } from "./_lib/db.js";
import { handleApiError, requireViewAuth, sendJson } from "./_lib/auth.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
    requireViewAuth(request);
    const rows = await getDashboardRows();
    const lastSync = await getLastSync();
    sendJson(response, 200, { rows, lastSync });
  } catch (error) {
    handleApiError(response, error);
  }
}
