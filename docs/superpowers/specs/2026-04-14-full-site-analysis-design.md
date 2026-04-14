# 全站自動分析 + 整站收錄量設計文件

> 專案：nuxt-seo-analyzer
> 日期：2026-04-14
> 關聯原始設計：`docs/superpowers/specs/2026-04-13-seo-tool-design.md`
> 參考實作：`C:\Users\User\Documents\wood-project\網域收錄與內頁提交整合版_V4.1`（Python 版網域收錄功能）

---

## 一、變更背景

原始設計採「用戶手選頁面」流程（最多 10 頁），使用者期望改為接近 Screaming Frog 的「輸入網域即全站分析」體驗，同時新增 Python 參考專案的「整站網頁與圖片收錄量」功能。

## 二、目標與範圍

### 變更目標

- 移除頁面選擇步驟，輸入網域後自動分析所有 sitemap 頁面（預設上限 30 頁，可調）
- 新增**整站收錄量**查詢：每次 session 快照當下「全站被 Google 收錄的網頁數與圖片數」
- 保留每頁的 `is_indexed` 檢查（並存策略）
- AI 報告改為**整站一份**（取代每頁一份），節省 token 並提升可讀性
- 分析進度改為 **SSE 串流**，結果逐頁推送

### 不在本次範圍

- 遞迴爬蟲（無 sitemap 的網站不支援全站分析，維持僅掃首頁連結的備援）
- Playwright 真瀏覽器降級（Cloudflare Workers 無法執行；三引擎全失敗則回傳 `null`）
- 分析結果匯出（CSV / PDF）
- 背景任務恢復（用戶關閉瀏覽器後不會自動續跑）

---

## 三、整體流程（取代原 discover → 選頁 → run）

```
1. 用戶輸入網域
      │
      ▼
2. POST /api/analyze/discover
   → 掃 sitemap.xml（+ 首頁連結備援）
   → 若頁數 0：回錯誤「找不到可分析頁面」
   → 若頁數 > APP_MAX_PAGES_PER_RUN：截取前 N 頁
   → 建立 session（status: running）
   → 扣 daily_usage 網域額度
   → 回傳 { sessionId, pageCount }
      │
      ▼
3. 前端跳轉到 /analyze/running?sessionId=xxx
      │
      ▼
4. 前端打開 POST /api/analyze/run 的 SSE 連線（body 帶 sessionId）
   → 推送 session_started 事件（回傳已建立的 sessionId 與 pageCount）
   → 平行啟動：
      (a) 整站收錄量查詢（查快取 → 未命中走三引擎）
      (b) 對每頁分批（每批 5 頁）執行 7 指標分析
   → 每完成一頁立即推 page_done 事件
   → 整站收錄量完成推 site_indexing 事件
      │
      ▼
5. 所有頁面完成 → 彙整所有指標 → 呼叫 GPT-4o-mini 產出整站中文報告
   → 推 ai_report_ready 事件
   → session status: done
   → 推 session_done 事件
      │
      ▼
6. 前端收到 session_done → 自動跳轉 /analyze/result/[sessionId]
```

---

## 四、資料庫 schema 變動

### 新增：整站收錄量快取

```sql
CREATE TABLE domain_indexing_cache (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          text         UNIQUE NOT NULL,  -- 正規化（去 https://、去 www、小寫）
  pages_indexed   int,                           -- site:domain.com 結果；查詢失敗為 null
  images_indexed  int,                           -- 圖片收錄數；僅當 pages > 0 才查
  engine_used     text,                          -- 'serpapi' | 'apify' | 'scraperapi' | null
  checked_at      timestamptz  NOT NULL DEFAULT now(),
  expires_at      timestamptz  NOT NULL
);

CREATE INDEX idx_domain_cache_lookup
  ON domain_indexing_cache(domain, expires_at);
```

**RLS：** 本表為全域快取（跨用戶共享），不設 RLS 或設為 `SELECT` 公開、`INSERT/UPDATE` 限 service role。

### 修改：`analysis_sessions` 加欄位

```sql
ALTER TABLE analysis_sessions ADD COLUMN site_pages_indexed   int;
ALTER TABLE analysis_sessions ADD COLUMN site_images_indexed  int;
ALTER TABLE analysis_sessions ADD COLUMN site_indexing_engine text;
ALTER TABLE analysis_sessions ADD COLUMN site_indexing_cached boolean DEFAULT false;
```

每個 session 都快照當下的整站收錄量（即使命中快取），歷史頁可做時序比較。

### 保留欄位

`page_analyses.indexing` 維持原設計，仍存每頁 `is_indexed`（並存策略）。

---

## 五、快取機制

### 命中邏輯

```
查詢 example.com 整站收錄量：

1. SELECT * FROM domain_indexing_cache
   WHERE domain = 'example.com' AND expires_at > now()

2. 命中
   → 直接使用 pages_indexed / images_indexed / engine_used
   → session 欄位 site_indexing_cached = true
   → 不扣用戶 API 配額

3. 未命中
   → 呼叫三引擎查詢
   → UPSERT domain_indexing_cache（更新 checked_at, expires_at = now + TTL）
   → session 欄位 site_indexing_cached = false
```

### TTL 控制

- 環境變數 `DOMAIN_CACHE_TTL_HOURS` 控制，預設 24 小時
- 快取是**全域共享**：A 用戶查過 example.com，B 用戶 24 小時內查同一網域也命中

### 併發去重

若兩個 session 同時查詢同一未快取網域，不做分散式鎖（UPSERT 會讓後寫者覆蓋前者，結果一致可接受）。

---

## 六、API 路由變動

```
server/api/
├── analyze/
│   ├── discover.post.ts           # 保留；不再回傳給用戶選，僅建立 session
│   ├── run.post.ts                # 改為 SSE 串流（text/event-stream）
│   └── status/[sessionId].get.ts  # 保留，SSE 斷線 fallback 用
│
├── domain/
│   └── indexing.post.ts           # 新增：整站收錄查詢（含快取）
│
├── page/
│   └── indexing.post.ts           # 保留：每頁索引檢查（並存）
│
└── report/
    └── generate.post.ts           # 改：產整站一份報告（非每頁）
```

### SSE 事件格式（`POST /api/analyze/run`）

`Content-Type: text/event-stream`

```
event: session_started
data: {"sessionId":"uuid","pageCount":28,"maxPages":30}

event: site_indexing
data: {"pagesIndexed":1250,"imagesIndexed":45,"engine":"serpapi","cached":true,"checkedAt":"2026-04-14T10:32:00Z"}

event: page_started
data: {"url":"https://example.com/","index":1}

event: page_done
data: {"url":"https://example.com/","analysis":{...7指標完整物件...}}

event: page_error
data: {"url":"https://example.com/slow","error":"timeout"}

event: ai_report_ready
data: {"report":"# 整站 SEO 健診報告\n\n..."}

event: session_done
data: {"sessionId":"uuid","status":"done"}
```

### 斷線 fallback

前端偵測 SSE 連線中斷 → 改用 `GET /api/analyze/status/[sessionId]` 每 2 秒輪詢。該端點回傳目前已入庫的完整 session + page_analyses。

---

## 七、三引擎整站查詢實作（對齊 Python 版）

### 查詢策略

| 用途 | Google 查詢 | 資料抽取 |
|------|------------|---------|
| 整站網頁收錄數 | `site:example.com` | SerpApi：`search_information.total_results`<br>ScraperAPI：HTML 解析 `#result-stats`<br>Apify：`google-search-scraper` 結果總數 |
| 整站圖片收錄數 | `site:example.com`（`tbm=isch`）| SerpApi：`images_results.length`<br>ScraperAPI：CSS 選擇器 `img.YQ4gaf[alt]`, `.ivg-i`, `.eA0Zlc`<br>Apify：`hooli~google-images-scraper`，maxImages=100 |

### 引擎順序（對齊 Python 版）

**SerpApi → ScraperAPI → Apify**

### 金鑰輪轉與降級

```
每個引擎維護 keys 陣列 + idx 指標：

loop engines (serpapi → scraperapi → apify):
  loop keys:
    try: call API with current key
    on error matching QUOTA_KEYWORDS:
      idx++
      continue
    on success: return result
  mark engine disabled, continue to next engine

all engines exhausted → return null
```

`QUOTA_KEYWORDS = ["429", "quota", "limit", "403", "402", "401", "unauthorized", "not-enough-usage", "token"]`

### 速率控制

- SerpApi：每次呼叫間 0.5s 延遲
- ScraperAPI：失敗後 2s 延遲重試；429 用 `2^attempt` 指數退避
- Apify：timeout 5s 指數退避，最多 3 次

### Apify 異常保護

若 Apify 回傳 `pages_count > 10` 視為異常（對齊 Python 版邏輯）→ 切下一組金鑰。

### 圖片查詢優化

僅當網頁收錄數 > 0 時才查圖片（網頁都沒收錄，圖片也不用查，省配額）。

---

## 八、每頁分析併發控制

- **批次大小：** 每批 5 頁平行處理（`p-limit` concurrency = 5）
- **批間間隔：** 無延遲，完成即啟下一批
- **單頁內部：** 7 指標維持 `Promise.allSettled` 全平行
- **超時：** 單頁任一指標超過 10 秒視為 timeout，該指標存 `null`，不阻塞其他頁面

此策略下 30 頁總時間估算：約 15–25 秒（視外部 API 回應速度），在 Cloudflare Workers 30 秒 wall-clock 限制內。

---

## 九、前端頁面變動

### 頁面異動表

| 頁面 | 動作 | 主要變更 |
|------|------|---------|
| `pages/index.vue` | 不動 | — |
| `pages/dashboard.vue` | 小改 | 輸入網域後直接跳 `/analyze/running`，不經 discover 頁 |
| `pages/analyze/discover.vue` | **刪除** | 選頁功能不再需要 |
| `pages/analyze/running.vue` | **大改** | SSE 接收、整站收錄卡、頁面進度清單 |
| `pages/analyze/result/[sessionId].vue` | 小改 | 頂部新增整站收錄量卡片 |
| `pages/history/index.vue` | 小改 | 每筆 session 顯示收錄量摘要 |

### `running.vue` 佈局

```
┌────────────────────────────────────────────┐
│ 分析中：example.com                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━  12/28 頁完成    │
├────────────────────────────────────────────┤
│ 🌐 整站 Google 收錄                         │
│    1,250         45         SerpApi        │
│    網頁收錄      圖片收錄    查詢引擎       │
│ 💾 使用快取 · 3 小時前更新                  │
├────────────────────────────────────────────┤
│ 📄 頁面進度（固定高度卡片，避免版面跳動）   │
│ ✅ /              完成 · 3 個問題            │
│ ✅ /blog          完成 · 1 個問題            │
│ ◌ /about          分析中...                  │
│ ⏳ /contact       等待中                    │
│ ...                                         │
├────────────────────────────────────────────┤
│ 🤖 AI 報告（等待所有頁面完成後產生）        │
└────────────────────────────────────────────┘
```

### `result/[sessionId].vue` 新增區塊

報告頁頂部（AI 報告上方）加整站收錄量卡片：

```
┌─────────────────────────────────────────────────┐
│ 🌐 整站 Google 收錄概況          [↻ 重新查詢]   │
├─────────────────────────────────────────────────┤
│    1,250            45            SerpApi       │
│    網頁收錄         圖片收錄       查詢引擎      │
│ 📅 快照時間：2026-04-14 10:32                   │
└─────────────────────────────────────────────────┘
```

警示邏輯：
- 網頁收錄 ≤ 1 → 數字 `text-rose-600` + 下方 ⚠️「疑似未被 Google 收錄」
- 圖片收錄 = 0 → 數字 `text-amber-600` + 「建議補強圖片 SEO」
- 查詢失敗（三引擎全掛）→ 卡片內容區顯示「索引查詢服務暫時無法使用」+ 重試按鈕

### `history/index.vue` 變動

每筆 session 卡片追加一行：

```
example.com · 2026-04-14 · 共 28 頁
收錄：1,250 頁 / 45 圖     📈（若較上次增加）
```

若該網域有多筆歷史且收錄量相較前次變化，顯示簡單 📈 / 📉 icon（不做圖表）。

---

## 十、UI/UX 細節（套用 ui-ux-pro-max 原則）

### `running.vue`

| 原則 | 實作 |
|------|------|
| `content-jumping`（CLS < 0.1）| 頁面清單初始化時依 pageCount 預先渲染骨架卡片，避免結果陸續回來造成版面跳動 |
| `progressive-loading` | 整站收錄卡與頁面卡使用骨架屏，SSE 資料抵達後 fade-in |
| `number-tabular` | 整站收錄數字使用 `font-variant-numeric: tabular-nums` |
| `duration-timing` 150–300ms | 狀態切換動畫 200ms ease-out |
| `stagger-sequence` 30–50ms | 初始渲染頁面清單，每卡 40ms 依序淡入 |
| `aria-live="polite"` | 進度文字區加此屬性，螢幕閱讀器朗讀 |
| `color-not-only` | 狀態同時用 icon 與顏色：等待 ⏳ / 分析中 ◌（旋轉）/ 完成 ✓ / 錯誤 ✕ |
| `reduced-motion` | 尊重系統偏好，關閉動畫 |
| `touch-target-size` 44pt | 錯誤狀態的「重試」按鈕至少 44×44 |

### `result/[sessionId].vue` 整站卡

| 原則 | 實作 |
|------|------|
| `visual-hierarchy` | 數字 `text-3xl font-bold`，標籤 `text-sm text-gray-500` |
| `color-accessible-pairs` | 警示紅字確保 ≥ 4.5:1 對比（rose-600 on white） |
| `empty-data-state` | 查詢失敗顯示訊息 + 重試按鈕，不顯示「0」或留白 |
| `whitespace-balance` | 三個數據間 `gap-8`，卡片內 `p-6` |
| `number-formatting` | 數字加千分位（1,250 而非 1250） |

### 視覺樣式（延用現有設計語彙）

- 卡片：`rounded-2xl` + `shadow-md` + `ring-1 ring-sky-100`
- 背景漸層：`bg-gradient-to-br from-white to-sky-50`
- 頂部 header：延用 `linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)`
- 色彩 token（建議補充到 `app/app.config.ts`）：
  ```ts
  ui: {
    colors: {
      primary: 'sky',
      success: 'emerald',
      warning: 'amber',
      danger:  'rose'
    }
  }
  ```

---

## 十一、AI 報告（變更）

### 變更內容

- **原：** 每頁產一份中文 AI 報告（`page_analyses.ai_report`）
- **新：** 整站產一份中文 AI 報告（儲存於 `analysis_sessions.ai_report`）
- `page_analyses.ai_report` 欄位保留但不再寫入（向後相容既有資料）

### 資料庫調整

```sql
ALTER TABLE analysis_sessions ADD COLUMN ai_report text;
-- page_analyses.ai_report 保留但預設為 null
```

### Prompt 輸入

整站報告輸入為：
```json
{
  "domain": "example.com",
  "site_indexing": { "pages": 1250, "images": 45 },
  "pages": [
    { "url": "...", "meta_tags": {...}, "cwv": {...}, ... },
    ...
  ]
}
```

### Prompt Caching

System prompt 固定，啟用 OpenAI prompt caching 降低費用。

### 費用估算

- 現行：每頁 $0.001 × 10 頁 = $0.01/次
- 變更後：整站 1 份（輸入 ~9000 token + 輸出 ~1500 token）≈ $0.005/次
- 每用戶每天滿額（5 網域）≈ $0.025/天

---

## 十二、環境變數

```env
# 新增
APP_MAX_PAGES_PER_RUN=30          # 單次分析最多頁數
DOMAIN_CACHE_TTL_HOURS=24         # 整站收錄快取時效
SITE_INDEXING_ENABLED=true        # 整站收錄查詢開關

# 調整：確認三引擎環境變數齊全（對齊 Python 版命名）
SERPAPI_KEYS=["key1","key2"]
SCRAPERAPI_KEYS=["key1","key2"]
APIFY_KEYS=["key1","key2"]

# 既有（沿用）
APP_DAILY_DOMAIN_LIMIT=5
OPENAI_API_KEY=
PAGESPEED_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 十三、錯誤處理矩陣

| 情境 | 行為 |
|------|------|
| sitemap 404 + 首頁無內部連結 | discover 回 `{ error: "no_pages_found" }`，不建立 session，不扣額度 |
| sitemap 有但頁數 > APP_MAX_PAGES_PER_RUN | 截取前 N 頁，UI 提示「共找到 X 頁，將分析前 30 頁」 |
| 單頁 7 指標中有失敗 | 該指標存 `null`，前端顯示「—」，不阻擋整體 |
| 單頁 `fetch` 超時 > 10s | 該頁標記 `page_analyses.status = 'error'`，推 `page_error` 事件 |
| 整站三引擎全失敗 | `site_pages_indexed = null`，前端顯示服務暫不可用 + 重試按鈕 |
| OpenAI 報告失敗 | `ai_report = null`，前端顯示「AI 報告生成失敗」+ 重新生成按鈕 |
| SSE 斷線 | 自動改用 `/api/analyze/status/[sessionId]` 每 2 秒輪詢 |
| 用戶關閉瀏覽器 | session 保持 `running` 狀態；下次進入相同 session 時以現有 DB 資料渲染 |
| 已達每日網域額度 | dashboard 輸入按鈕 disabled，顯示「今日額度已用完」 |

---

## 十四、用量管控

- 分析前檢查 `daily_usage.domain_count < APP_DAILY_DOMAIN_LIMIT`
- **扣額時機：** discover 成功且頁數 > 0 時才扣
- **整站收錄命中快取：** 不扣 API 配額（快取本來就不耗 API）
- 每頁索引檢查無獨立配額，併入該 session 的整體呼叫中

---

## 十五、測試重點

| 模組 | 測試項目 |
|------|---------|
| `discovery/sitemap.ts` | 正常、sitemap index 多層、無 sitemap、xml 格式錯誤 |
| `indexing/domain.ts` | 三引擎降級順序、金鑰輪轉、快取命中/未命中、Apify `pages_count > 10` 異常 |
| `indexing/cache.ts` | TTL 過期刷新、UPSERT 行為、同網域併發查詢 |
| `analyze/run.sse.ts` | 事件格式正確、斷線 fallback、session 狀態流轉 |
| `report/generate.ts` | 整站 prompt 組合、cache hit、部分頁面失敗時仍能產報告 |
| `running.vue` | SSE 事件接收、骨架屏、進度計算、reduced-motion |
| `result/[sessionId].vue` | 整站卡三種狀態（正常 / 警示 / 失敗）、重新查詢按鈕 |

---

## 十六、開發順序建議

1. **Phase A：資料層** — schema migration、cache table、session 欄位
2. **Phase B：整站收錄引擎** — 三引擎 client、金鑰輪轉、快取封裝
3. **Phase C：SSE 串流** — run.post.ts 改寫、事件發送工具
4. **Phase D：前端改版** — running.vue 大改、result / history 小改、刪除 discover.vue
5. **Phase E：AI 報告調整** — 整站 prompt、移除每頁報告
6. **Phase F：整合測試** — 端到端流程、錯誤情境、快取驗證

實作計畫由 writing-plans skill 後續產出。

---

## 十七、向後相容與資料遷移

- 既有資料：`page_analyses.ai_report` 既有內容保留，不清除
- 歷史 session 顯示：舊 session 的 `site_pages_indexed` 為 `null`，UI 顯示「—」，不影響列表
- 資料庫 migration 全為新增欄位或新表，無破壞性變更
