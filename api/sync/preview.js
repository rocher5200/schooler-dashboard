import { requireSyncAuth, handleApiError, sendJson } from "../_lib/auth.js";
import { buildPreview } from "../_lib/sync-service.js";

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
    requireSyncAuth(request);
    const preview = await buildPreview();
    sendJson(response, 200, preview);
  } catch (error) {
    handleApiError(response, error);
  }
}
