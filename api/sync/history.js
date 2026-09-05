import { getSyncHistory } from "../_lib/db.js";
import { requireViewAuth, handleApiError, sendJson } from "../_lib/auth.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
    requireViewAuth(request);
    const runs = await getSyncHistory(10);
    sendJson(response, 200, { runs });
  } catch (error) {
    handleApiError(response, error);
  }
}
