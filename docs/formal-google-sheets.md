# 正式 Google Sheets 資料層

這個專案不使用 Neon 或其他資料庫。正式看板資料保存在一份 Google Sheets，由 Vercel API 讀寫。

## Spreadsheet

建立一份新的 Google Sheets，例如：

`Schooler Dashboard Formal Data`

將這份 Google Sheets 分享給 service account email，權限設為「編輯者」。

Vercel 環境變數填入：

```text
FORMAL_DATA_SPREADSHEET_ID=<這份 Google Sheets 的 ID>
```

## 自動建立的分頁

API 第一次讀寫時會自動建立兩個分頁並補上表頭：

- `DashboardRecords`
- `SyncRuns`

## DashboardRecords 欄位

| 欄位 | 說明 |
| --- | --- |
| `month` | 月份，格式 `YYYY-MM` |
| `code` | 培訓代碼 |
| `course` | 培訓課程 |
| `price` | 售價 |
| `quantity` | 銷售數量 |
| `paid` | 繳費金額 |
| `refunds` | 退費金額 |
| `source_hash` | 同步時產生的資料指紋 |
| `updated_at` | 寫入時間 |

看板顯示的淨業績由 API 計算：

```text
netPaid = paid - refunds
```

## SyncRuns 欄位

| 欄位 | 說明 |
| --- | --- |
| `id` | 同步紀錄 ID |
| `status` | `previewed`、`published`、`blocked`、`failed` |
| `started_at` | 開始時間 |
| `finished_at` | 結束時間 |
| `added_months` | 新增月份 JSON |
| `changed_months` | 修改月份 JSON |
| `new_courses` | 新增課程 JSON |
| `paid_delta` | 業績變化 |
| `refund_delta` | 退費變化 |
| `net_paid_delta` | 淨業績變化 |
| `record_count` | 本次讀取後的資料筆數 |
| `qa` | QA 結果 JSON |
| `error` | 錯誤訊息 |
| `summary_text` | 人類可讀摘要 |

## 為什麼不用原始 Excel 直接當看板資料

原始 Excel 是工作表，可能正在編輯、欄位可能改名、資料可能填到一半。正式 Google Sheets 是發布後資料：只有通過 QA 並確認發布的資料會寫進來。

```text
原始 Excel：編輯用
正式 Google Sheets：看板讀取用
SyncRuns：追蹤每次更新
```
