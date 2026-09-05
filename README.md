# Schooler 績效看板

這個版本把原本的靜態 `sales-data.js` 看板升級為長期正式使用架構：GitHub 只保存網站程式碼，Google Drive Excel 保留為來源資料，正式看板資料寫入一份 Google Sheets。

## 架構

```text
Google Drive Excel
  業績統計.xlsx
  退費統計.xlsx
        ↓
Vercel Serverless API
  讀取 Drive → 比對資料 → QA → 整理 → 寫入正式 Google Sheets
        ↓
Google Sheets 正式資料層
  DashboardRecords
  SyncRuns
        ↓
Schooler Dashboard
```

## 主要改動

- 看板不再直接載入 `sales-data.js` 作為主要資料庫。
- `GET /api/dashboard-data` 從正式 Google Sheets 讀取資料。
- `POST /api/sync/preview` 讀取 Google Drive Excel，產生更新前預覽。
- `POST /api/sync/publish` 在 QA 通過後寫入正式 Google Sheets。
- `GET /api/sync/history` 顯示最近同步紀錄。
- QA 發現重大異常時會停止發布，並保留 blocked 同步紀錄。
- `sales-data.js` 僅作為初次搬遷資料的 legacy seed 來源。
- GitHub 只保存網站程式碼，不作為每次資料更新的儲存層。

## 權限設計

所有敏感權限都只放在 Vercel 環境變數，不會出現在前端或 GitHub：

- `FORMAL_DATA_SPREADSHEET_ID`：正式 Google Sheets 的 spreadsheet ID。
- `DASHBOARD_VIEW_TOKEN`：看板讀取密碼。
- `SYNC_ADMIN_TOKEN`：同步管理密碼，可預覽與發布更新。
- `GOOGLE_DRIVE_SALES_FILE_ID`：業績 Excel 的 Drive file ID。
- `GOOGLE_DRIVE_REFUNDS_FILE_ID`：退費 Excel 的 Drive file ID。
- `GOOGLE_SERVICE_ACCOUNT_JSON`：Google service account JSON。

建議建立 Google Cloud service account：

- 原始業績 Excel：分享給 service account，權限為檢視者。
- 原始退費 Excel：分享給 service account，權限為檢視者。
- 正式 Google Sheets：分享給 service account，權限為編輯者。

## 初次部署

1. 建立一份新的 Google Sheets，例如 `Schooler Dashboard Formal Data`。
2. 將這份正式 Google Sheets 分享給 service account email，權限設為編輯者。
3. 將兩份原始 Drive Excel 分享給 service account email，權限設為檢視者。
4. 在 Vercel 匯入此 GitHub repo。
5. 在 Vercel Project Settings 設定 `.env.example` 裡的環境變數。
6. 部署完成後，在本機或 Vercel CLI 執行一次：

```bash
npm install
npm run seed
```

`npm run seed` 會把現有 `sales-data.js` 的 2026/01 到 2026/08 資料搬進正式 Google Sheets。之後正式資料以 Google Sheets 的 `DashboardRecords` 分頁為準。

## 正式 Google Sheets 分頁

API 第一次讀寫時會自動建立：

- `DashboardRecords`：看板正式資料。
- `SyncRuns`：同步紀錄、QA 結果與錯誤。

欄位細節請看 `docs/formal-google-sheets.md`。

## 每月同步流程

1. 維護 Google Drive 裡的業績與退費 Excel。
2. 打開 Schooler 績效看板。
3. 輸入同步管理密碼。
4. 按「更新資料」。
5. 按「讀取 Drive 並產生預覽」。
6. 檢查新增月份、修改月份、新增課程、業績/退費/淨業績變化。
7. 若 QA 沒有重大異常，按「確認更新正式資料」。
8. 看板重新載入正式資料，並在 `SyncRuns` 保存本次結果。

## QA 規則

目前會阻擋發布的重大異常包含：

- 沒有讀到任何可同步資料。
- 月份格式不是 `YYYY-MM`。
- 缺少培訓代碼或課程名稱。
- 同月份、同代碼、同課程重複。
- 銷售數量為負數。
- 單月份退費率超過 50%。

目前會提示但不阻擋的警示包含：

- 繳費金額為負數。
- 單課程退費高於該課程繳費。

## 測試

```bash
npm install
npm run test:normalize
```

這個 smoke test 使用模擬 Excel 驗證月份解析、業績與退費合併、QA 與差異摘要。

## 後續建議

- 上線後先用一次真實 Drive Excel 跑 preview，不急著 publish。
- 如果 Excel 欄位名稱還有其他寫法，把別名補進 `api/_lib/normalize.js`。
- 若看板只給內部使用，建議再搭配 Vercel Password Protection 或公司 SSO。
