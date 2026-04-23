# 面試強化功能設計文件

> 專案：nuxt-seo-analyzer  
> 建立日期：2026-04-23  
> 背景：本專案作為面試用 side project，目標是讓面試官能無摩擦地評估成果，並在 GitHub repo 層面就能看到程式品質信號。

---

## 一、目標與範圍

### 目標
1. **GitHub Actions CI + README badge** — 面試官打開 repo 第一眼看到 `✅ tests passing`
2. **公開分享連結** — 跑完分析後可複製公開 URL 貼進履歷，面試官不需要登入就能看到完整報告

### 不在範圍內
- 趨勢圖表（留待後續）
- Session diff 比較（留待後續）
- 排程自動掃描

---

## 二、GitHub Actions CI

### 檔案
`.github/workflows/ci.yml`

### Trigger
- `push` 到 `main`
- `pull_request` 到 `main`

### Steps
```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
- run: npm ci
- run: npx vitest run
```

### Node 版本
20（對齊 Cloudflare Pages 部署環境）

### README badge
在 README.md 頂部（專案標題下方）加入：

```markdown
![CI](https://github.com/Xenosword-X/nuxt-seo-analyzer/actions/workflows/ci.yml/badge.svg)
```

---

## 三、公開分享連結

### 3-1 資料層

#### analysis_sessions 新增欄位
```sql
ALTER TABLE analysis_sessions
  ADD COLUMN share_token uuid UNIQUE DEFAULT gen_random_uuid();
```

- 現有 row 自動補 `gen_random_uuid()` 填值
- 新分析建立時自動生成，不需要額外操作
- RLS 政策維持不變（只影響 authenticated 存取）

### 3-2 新增 API

**路由：** `GET /api/share/[token].get.ts`

**邏輯：**
1. 從 URL 取得 `token`
2. 用 **service role key**（`NUXT_SUPABASE_SERVICE_ROLE_KEY`，已存在）建立 Supabase client，繞過 RLS
3. 查詢 `analysis_sessions` where `share_token = token`
4. 若找不到 → 回傳 404
5. 查詢對應的 `page_analyses` where `session_id = session.id`
6. 回傳 `{ session, pages }` JSON
7. **不驗證任何 user auth**，此 endpoint 完全公開

**安全考量：**
- token 為 UUID v4，128-bit 隨機，暴力猜測不可行
- 僅回傳唯讀資料，無寫入路徑
- 不回傳 `user_id` 欄位（在 select 時排除）

### 3-3 新增頁面

**路由：** `app/pages/share/[token].vue`

**Auth 設定：**
```ts
definePageMeta({ auth: false })
```
不套用 `auth.global.ts` middleware。

**頁面結構：**
- 頂部固定顯示灰色 banner：「此為公開分享報告，僅供檢視」
- 報告主體與 `result/[sessionId].vue` 相同（頁面清單 + 7 大指標 + AI 報告 + 整站收錄卡）
- **不顯示** 匯出按鈕（CSV / Markdown）
- **不顯示** 登出按鈕

**資料載入：**
- `useFetch('/api/share/[token]')` on mount
- 找不到時顯示「連結已失效或不存在」

**UI 複用策略：**
直接 import 現有元件（`ScoreBar.vue`、`IssueList.vue`、`MetaRow.vue`、`CWVItem.vue`），不重寫。報告頁的 template 邏輯從 `result/[sessionId].vue` 提取為 composable 或直接複製精簡版。

### 3-4 結果頁 UI 變動

**位置：** `app/pages/analyze/result/[sessionId].vue` 右上角，現有 Export 按鈕旁

**新增按鈕：** 「複製分享連結」

**行為：**
1. 點擊後呼叫 `navigator.clipboard.writeText(shareUrl)`
2. `shareUrl` 組成：`${window.location.origin}/share/${session.share_token}`
3. 成功後 button 文字暫時改為「已複製！」（1.5 秒後還原）
4. `session.share_token` 從現有 API 回傳的 session 物件取得（需確認 `history/[sessionId]` endpoint 有 select 此欄位）

---

## 四、需確認的細節

1. **`share_token` 欄位 select**：現有 `GET /api/history/index.get.ts` 與 `GET /api/analyze/status/[sessionId].get.ts` 需確認是否回傳 `share_token`，若無需補上
2. **Supabase service role client**：`server/utils/supabase.ts` 已有 service role client，確認可直接沿用
3. **`auth: false` 相容性**：確認 `@nuxtjs/supabase` 的 `auth.global.ts` middleware 設定是否支援 `definePageMeta({ auth: false })` 跳過

---

## 五、工作量估計

| 項目 | 估計時間 |
|------|---------|
| GitHub Actions CI yml | 15 分鐘 |
| README badge | 5 分鐘 |
| DB migration（ALTER TABLE） | 10 分鐘 |
| `/api/share/[token].get.ts` | 1 小時 |
| `/share/[token].vue` 頁面 | 2-3 小時 |
| 結果頁「複製分享連結」按鈕 | 30 分鐘 |
| **總計** | **~4-5 小時** |
