import { google } from "googleapis";

export function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 尚未設定");

  const parsed = JSON.parse(raw);
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

export function getGoogleAuth(scopes) {
  return new google.auth.GoogleAuth({
    credentials: getServiceAccountCredentials(),
    scopes
  });
}
