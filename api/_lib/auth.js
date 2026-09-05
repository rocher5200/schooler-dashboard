export function requireViewAuth(request) {
  const viewToken = process.env.DASHBOARD_VIEW_TOKEN;
  const syncToken = process.env.SYNC_ADMIN_TOKEN;
  const expectedTokens = [viewToken, syncToken].filter(Boolean);

  if (!expectedTokens.length) {
    const error = new Error("DASHBOARD_VIEW_TOKEN 或 SYNC_ADMIN_TOKEN 尚未設定");
    error.statusCode = 500;
    throw error;
  }

  const token = readBearerToken(request);
  if (!expectedTokens.includes(token)) {
    const error = new Error("看板讀取密碼錯誤或未提供");
    error.statusCode = 401;
    throw error;
  }
}

export function requireSyncAuth(request) {
  const expected = process.env.SYNC_ADMIN_TOKEN;
  if (!expected) {
    const error = new Error("SYNC_ADMIN_TOKEN 尚未設定");
    error.statusCode = 500;
    throw error;
  }

  const token = readBearerToken(request);
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
  sendJson(response, error.statusCode || 500, { error: error.message || "伺服器錯誤", ...(error.payload || {}) });
}

function readBearerToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}
