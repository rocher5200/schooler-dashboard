import { google } from "googleapis";
import * as XLSX from "xlsx";
import { getGoogleAuth } from "./google-auth.js";

export async function loadDriveWorkbook(fileId) {
  if (!fileId) throw new Error("Google Drive Excel 檔案 ID 尚未設定");

  const auth = getGoogleAuth(["https://www.googleapis.com/auth/drive.readonly"]);
  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );

  return XLSX.read(Buffer.from(response.data), { type: "buffer", cellDates: true });
}
