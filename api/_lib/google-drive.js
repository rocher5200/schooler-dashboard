import { google } from "googleapis";
import * as XLSX from "xlsx";

export async function loadDriveWorkbook(fileId) {
  if (!fileId) throw new Error("Google Drive Excel 檔案 ID 尚未設定");

  const auth = new google.auth.GoogleAuth({
    credentials: getServiceAccountCredentials(),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"]
  });
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  return XLSX.read(Buffer.from(response.data), { type: "buffer", cellDates: true });
}

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 尚未設定");

  const parsed = JSON.parse(raw);
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}
