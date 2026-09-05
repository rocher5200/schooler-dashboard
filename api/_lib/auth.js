export function requireSyncAuth(request) {
  const expected = process.env.SYNC_ADMIN_TOKEN;
  if (!expected) {
    const error = new Error("SYNC_ADMIN_TOKEN 尚未設定");
    error.statusCode = 500;
    throw error;
  }

  const header = request.headers.authorization || request.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token !== expected) {
    const error = new Error("同步管理密碼錯誤或未提供");
    error.statusCode = 401;
    throw error;
  }
}

export function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

export function handleApiError(response, error) {
  sendJson(response, error.statusCode || 500, { error: error.message || "伺服器錯誤" });
}
