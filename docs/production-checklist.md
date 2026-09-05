# 正式上線檢查清單

## 1. 正式 Google Sheets

- 建立一份新的 Google Sheets，例如 `Schooler Dashboard Formal Data`。
- 將這份正式 Google Sheets 分享給 service account email，權限設為編輯者。
- 從 Sheets URL 複製 spreadsheet ID，填入 Vercel `FORMAL_DATA_SPREADSHEET_ID`。
- 不需要手動建立分頁，API 會自動建立：
  - `DashboardRecords`
  - `SyncRuns`

## 2. Google Drive 原始 Excel

- 建立 Google Cloud service account。
- 啟用 Google Drive API 與 Google Sheets API。
- 產生 service account JSON key。
- 將業績 Excel 分享給 service account email，權限設為檢視者。
- 將退費 Excel 分享給 service account email，權限設為檢視者。
- 從 Drive URL 複製兩個 file ID：
  - `GOOGLE_DRIVE_SALES_FILE_ID`
  - `GOOGLE_DRIVE_REFUNDS_FILE_ID`

## 3. Vercel 環境變數

Production 與 Preview 至少設定以下變數：

- `FORMAL_DATA_SPREADSHEET_ID`
- `DASHBOARD_VIEW_TOKEN`
- `SYNC_ADMIN_TOKEN`
- `GOOGLE_DRIVE_SALES_FILE_ID`
- `GOOGLE_DRIVE_REFUNDS_FILE_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

設定後重新部署，因為環境變數只會套用到新部署。

## 4. 初次資料搬遷

正式 Google Sheets 分享與環境變數設定好後，執行一次：

```bash
npm install
npm run seed
```

這會把 legacy `sales-data.js` 搬進正式 Google Sheets 的 `DashboardRecords`。完成後看板應可讀到原本 2026/01 到 2026/08 的資料，`SyncRuns` 會新增一筆 initial seed 紀錄。

## 5. 第一次 Drive 預覽

- 打開正式網址。
- 輸入 `SYNC_ADMIN_TOKEN`。
- 按「載入看板」，確認舊資料正常。
- 按「更新資料」。
- 按「讀取 Drive 並產生預覽」。
- 檢查：
  - 新增月份是否合理。
  - 修改月份是否合理。
  - 新增課程是否合理。
  - 業績變化、退費變化、淨業績變化是否合理。
  - QA 是否有重大異常。

第一次請先只 preview，不急著 publish。

## 6. 第一次正式發布

QA 通過後：

- 按「確認更新正式資料」。
- 確認看板自動重新載入。
- 確認 `SyncRuns` 新增一筆 `published`。
- 抽查 KPI、月份趨勢、排行榜、明細資料是否符合 Excel。

## 7. 異常處理

若 QA 顯示 `停止發布`：

- 正式 Google Sheets 的 `DashboardRecords` 不會更新。
- `SyncRuns` 會保留 blocked 紀錄。
- 依照畫面顯示的異常回到 Excel 修正。
- 修正後重新 preview。

## 8. 建議的正式權限

- `DASHBOARD_VIEW_TOKEN` 給一般內部查看者。
- `SYNC_ADMIN_TOKEN` 只給能更新資料的人。
- 原始 Excel 只給 service account 檢視權限。
- 正式 Google Sheets 只給 service account 編輯權限。
- `GOOGLE_SERVICE_ACCOUNT_JSON` 不要貼在聊天、文件或 GitHub issue。
- 若網站只供公司內部使用，建議搭配 Vercel Password Protection 或 SSO。

## 9. 每月例行流程

```text
更新 Google Drive Excel
  ↓
按「讀取 Drive 並產生預覽」
  ↓
檢查新增/修改/QA
  ↓
QA 通過才按「確認更新正式資料」
  ↓
看板更新，SyncRuns 保存紀錄
```
