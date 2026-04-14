# nuxt-seo-analyzer

> 繁體中文 SEO 深度分析工具 — 市場上第一款以繁體中文為核心、由 AI 自動產生健診報告的 SEO 分析平台。

---

## 專案簡介

市面上主流 SEO 工具（Ahrefs、SEMrush、Screaming Frog）均為英文介面，台灣與華語圈的 SEO 從業者需要額外花時間理解英文報告。本工具以**繁體中文**為核心，提供中文 UI 與 GPT-4o-mini 自動產生的中文 SEO 健診報告，針對熟悉 SEO 的專業用戶設計。

### 核心特色

- 全繁體中文 UI 與分析報告
- GPT-4o-mini 自動產生個人化中文 SEO 健診建議
- 三引擎降級索引檢查（SerpApi → Apify → ScraperAPI），多組金鑰輪轉，穩定不中斷
- 7 大 SEO 指標一次完整掃描
- 歷史紀錄追蹤，可回顧過去分析結果

---

## 功能總覽

### 1. 頁面探索與自動全站分析

輸入網域後，系統自動同時掃描：
- `sitemap.xml`（解析所有 URL 與最後修改時間）
- 首頁內部連結（作為備援）

合併去重後自動分析前 N 頁（預設 30 頁，可由 `APP_MAX_PAGES_PER_RUN` 調整），**無需手動勾選**。分析結果透過 **SSE 即時串流**，頁面完成一頁就推送一頁，搭配進度條與頁面清單即時更新。

### 2. 整站 Google 收錄量

每次分析另外查詢**整站範圍**的 Google 收錄統計：
- **整站網頁收錄數**（`site:domain.com` 查詢總結果數）
- **整站圖片收錄數**（`site:domain.com` + 圖片搜尋）
- 查詢結果**快取 24 小時**（全域共享，跨用戶），避免重複呼叫
- 與 Python 參考實作對齊的三引擎降級（SerpApi → ScraperAPI → Apify）

### 3. 七大 SEO 分析指標（每頁）

每個頁面分析以下七個維度，所有分析**平行執行**，速度最佳化：

| 指標 | 說明 |
|------|------|
| **Meta 標籤** | 掃描 title、description、og:title、og:description、og:image、canonical、robots meta，並給出 0-100 分評分 |
| **Core Web Vitals** | 呼叫 Google PageSpeed Insights API，取得 FCP、LCP、TBT、CLS 與整體效能分數（行動版） |
| **Google 索引狀態** | 三引擎降級檢查：SerpApi → Apify → ScraperAPI，多組 API 金鑰自動輪轉，回傳收錄狀態與收錄頁數 |
| **標題結構** | 分析 H1～H3 層級結構與內部連結數量，偵測缺少 H1 或 H1 重複等問題 |
| **圖片 Alt 文字** | 掃描頁面所有圖片，列出缺少 alt 屬性的圖片 src，影響 SEO 與無障礙性 |
| **結構化資料（Schema）** | 偵測 JSON-LD 標記，回傳所有偵測到的 @type 類型（如 Article、BreadcrumbList） |
| **Robots / Sitemap** | 驗證 robots.txt 是否封鎖 Googlebot 爬取，確認 sitemap.xml 是否存在 |

### 4. AI 整站中文健診報告

所有頁面分析完成後，自動呼叫 OpenAI GPT-4o-mini，**彙整整站所有頁面資料**產生一份繁體中文 SEO 健診報告（Markdown 格式），包含：
- 整體摘要（點出關鍵問題）
- 優先改善項目（依影響度排序）
- 各類別檢討（Meta、CWV、Schema、標題、圖片、索引、收錄量）
- 總結建議

### 5. 分析結果匯出

結果頁面右上角提供匯出下拉選單：
- **匯出 CSV**：UTF-8 with BOM，每頁一列含 12 個欄位，Excel 開啟無亂碼
- **匯出 Markdown**：整站報告 + AI 摘要 + 各頁問題清單，適合貼入 Notion／客戶提案

### 6. 分析歷史紀錄

所有分析結果儲存於 Supabase PostgreSQL，使用者可：
- 在歷史紀錄頁面瀏覽所有過去的分析（顯示每筆的整站收錄量摘要）
- 點擊任一筆記錄重新查看完整報告
- Dashboard 首頁顯示最近 5 筆分析快速入口

### 7. 使用限制

| 項目 | 限制 |
|------|------|
| 每日可分析網域數 | 5 個（每用戶，可由 `APP_DAILY_DOMAIN_LIMIT` 調整） |
| 每次最多分析頁數 | 30 頁（可由 `APP_MAX_PAGES_PER_RUN` 調整） |
| 整站收錄量快取時效 | 24 小時（可由 `DOMAIN_CACHE_TTL_HOURS` 調整） |

---

## 技術架構

### 前端

| 技術 | 說明 |
|------|------|
| [Nuxt 3](https://nuxt.com) | 全端框架，使用 Nuxt 4 的 `app/` 目錄慣例 |
| [Vue 3](https://vuejs.org) | Composition API + `<script setup>` |
| [@nuxt/ui](https://ui.nuxt.com) | UI 元件庫（UButton、UCard、UInput 等） |
| [Tailwind CSS](https://tailwindcss.com) | Utility-first CSS 框架 |
| [marked](https://marked.js.org) | Markdown 渲染（AI 報告內容） |

### 後端

| 技術 | 說明 |
|------|------|
| Nuxt Nitro | Server routes，部署為 Cloudflare Workers |
| [cheerio](https://cheerio.js.org) | 伺服器端 HTML 解析（meta tags、headings、images、schema） |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | sitemap.xml 解析 |
| [openai](https://github.com/openai/openai-node) | GPT-4o-mini API 呼叫（中文報告產生） |

### 外部 API

| API | 用途 |
|-----|------|
| Google PageSpeed Insights API | Core Web Vitals 分數（免費） |
| SerpApi | Google 索引狀態檢查（主引擎） |
| Apify | 索引狀態檢查（備援引擎一） |
| ScraperAPI | 索引狀態檢查（備援引擎二） |
| OpenAI GPT-4o-mini | 中文 SEO 健診報告產生 |

### 資料庫與認證

| 技術 | 說明 |
|------|------|
| [Supabase](https://supabase.com) | PostgreSQL 資料庫 + Google OAuth2 認證 |
| Row Level Security（RLS） | 確保使用者只能存取自己的資料 |

### 部署

| 技術 | 說明 |
|------|------|
| [Cloudflare Pages](https://pages.cloudflare.com) | 前端靜態資源 + Nitro server routes（Workers） |

### 測試

| 技術 | 說明 |
|------|------|
| [Vitest](https://vitest.dev) | 單元測試框架 |
| happy-dom | 測試環境 DOM 模擬 |

---

## 資料庫結構

```sql
-- 每日用量追蹤
daily_usage (
  id uuid PK, user_id uuid FK, date date,
  domain_count int, UNIQUE(user_id, date)
)

-- 分析工作階段
analysis_sessions (
  id uuid PK, user_id uuid FK, domain text,
  status text, page_count int, created_at timestamptz
)

-- 每頁分析結果
page_analyses (
  id uuid PK, session_id uuid FK, url text,
  meta_tags jsonb, core_web_vitals jsonb,
  robots_sitemap jsonb, schema_data jsonb,
  headings jsonb, images jsonb, indexing jsonb,
  ai_report text, analyzed_at timestamptz
)
```

---

## 專案結構

```
nuxt-seo-analyzer/
├── app/
│   ├── assets/css/main.css           # Tailwind + NuxtUI 入口
│   ├── components/
│   │   ├── ScoreBar.vue              # 分數進度條元件
│   │   ├── IssueList.vue             # 問題清單元件
│   │   ├── MetaRow.vue               # Meta 欄位列元件
│   │   └── CWVItem.vue               # CWV 單項指標元件
│   ├── middleware/
│   │   └── auth.global.ts            # 全域 Auth 保護
│   └── pages/
│       ├── index.vue                 # 登入頁
│       ├── confirm.vue               # OAuth 回呼頁
│       ├── dashboard.vue             # 主頁（輸入網域 + 歷史）
│       ├── analyze/
│       │   ├── discover.vue          # 頁面選擇
│       │   ├── running.vue           # 分析進度
│       │   └── result/
│       │       └── [sessionId].vue   # 完整報告頁
│       └── history/
│           └── index.vue             # 歷史紀錄列表
│
├── server/
│   ├── api/
│   │   ├── analyze/
│   │   │   ├── discover.post.ts      # 掃描 sitemap + 首頁
│   │   │   ├── run.post.ts           # 建立 session + 背景分析
│   │   │   └── status/
│   │   │       └── [sessionId].get.ts # 查詢分析進度
│   │   ├── usage/
│   │   │   ├── check.get.ts          # 查詢今日用量
│   │   │   └── increment.post.ts     # 消耗一次用量
│   │   └── history/
│   │       └── index.get.ts          # 歷史 session 列表
│   └── utils/
│       ├── supabase.ts               # Server-side Supabase client
│       ├── usage.ts                  # 用量邏輯
│       ├── report.ts                 # GPT-4o-mini 報告產生
│       ├── discovery/
│       │   ├── sitemap.ts            # Sitemap 解析器
│       │   └── homepage.ts           # 首頁連結抽取
│       └── analyzers/
│           ├── types.ts              # 共用 TypeScript 型別
│           ├── meta.ts               # Meta tags 分析
│           ├── cwv.ts                # Core Web Vitals
│           ├── robots.ts             # Robots + Sitemap 驗證
│           ├── schema.ts             # JSON-LD 偵測
│           ├── headings.ts           # 標題結構分析
│           ├── images.ts             # 圖片 Alt 掃描
│           └── indexing.ts           # 三引擎索引檢查
│
├── supabase/
│   └── schema.sql                    # 資料庫 DDL + RLS 政策
├── tests/                            # Vitest 單元測試（42 tests）
├── docs/superpowers/                 # 設計文件與實作計畫
├── nuxt.config.ts
└── vitest.config.ts
```

---

## 環境設定

複製 `.env.example` 為 `.env` 並填入以下變數：

```env
# Supabase（由 @nuxtjs/supabase 直接讀取，不需 NUXT_ 前綴）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
NUXT_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
NUXT_OPENAI_API_KEY=sk-...

# 索引檢查 API（JSON 陣列格式，支援多組金鑰輪轉）
NUXT_SERP_API_KEYS=["key1","key2"]
NUXT_APIFY_KEYS=["key1","key2"]
NUXT_SCRAPER_API_KEYS=["key1","key2"]

# Google PageSpeed Insights（免費 API）
NUXT_PAGESPEED_API_KEY=AIza...

# 使用限制
NUXT_APP_DAILY_DOMAIN_LIMIT=5
NUXT_APP_MAX_PAGES_PER_RUN=10
```

---

## 本機開發

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
# 開啟 http://localhost:3000

# 執行單元測試
npx vitest run

# 執行測試（監看模式）
npx vitest
```

### Supabase 初始化

1. 在 [Supabase Dashboard](https://app.supabase.com) 建立新專案
2. 至 SQL Editor 執行 `supabase/schema.sql`
3. 至 Authentication → Providers → Google，啟用並填入 Google OAuth2 Client ID / Secret

---

## 部署至 Cloudflare Pages

```bash
# 建置
npm run build
```

透過 Cloudflare Pages 連接 GitHub repo 自動部署（Nitro preset 已設定為 `cloudflare-pages`）。在 Cloudflare Pages 的環境變數設定中填入所有 `NUXT_` 前綴的環境變數。

---

## 使用流程

```
1. 以 Google 帳號登入
        ↓
2. 在 Dashboard 輸入網域（例：example.com）→ 開始分析
        ↓
3. 系統掃描 sitemap.xml + 首頁，自動分析前 N 頁（預設 30 頁）
   同時平行查詢整站 Google 收錄量（網頁數 / 圖片數）
        ↓
4. 進度頁面透過 SSE 即時串流顯示進度，每完成一頁立即更新
        ↓
5. 全部頁面完成 → 產生整站 AI 中文健診報告 → 自動跳轉結果頁
        ↓
6. 結果頁查看完整報告
   ├── 頂部：整站 Google 收錄概況卡
   ├── 左側：頁面清單（✅ ⚠️ ❌ 標示問題數量）
   ├── 右側：7 大指標詳情 + AI 整站健診報告
   └── 右上角：匯出 CSV / Markdown
        ↓
7. 歷史紀錄頁面可回顧所有過去的分析（含收錄量摘要）
```

---

## 測試覆蓋範圍

```
tests/server/utils/
├── usage.test.ts         # 用量追蹤邏輯（5 tests）
├── sitemap.test.ts       # Sitemap 解析（5 tests）
├── homepage.test.ts      # 首頁連結抽取（4 tests）
└── analyzers/
    ├── meta.test.ts      # Meta tags 分析（4 tests）
    ├── robots.test.ts    # Robots 驗證（4 tests）
    ├── schema.test.ts    # Schema 偵測（4 tests）
    ├── headings.test.ts  # 標題分析（4 tests）
    ├── images.test.ts    # 圖片 Alt 掃描（4 tests）
    ├── indexing.test.ts  # 三引擎索引檢查（4 tests）
    └── cwv.test.ts       # Core Web Vitals（4 tests）

總計：42 tests，全數通過
```

---

## 技術決策說明

**為什麼選 Nuxt 3 + Cloudflare Pages？**
Nuxt Nitro 的 server routes 可以直接部署為 Cloudflare Workers，實現前後端同一個 repo、同一個部署流程，對 side project 而言維護成本最低。

**為什麼選 Supabase 而非 Cloudflare D1？**
Supabase 提供完整的 Auth（Google OAuth2）、Row Level Security、PostgreSQL，且開發者對其較熟悉，適合需要認證系統的應用。

**為什麼用三引擎降級而非單一 API？**
索引檢查涉及爬取 Google 搜尋結果，任何單一 API 都有配額限制與封鎖風險。三引擎降級加上多組金鑰輪轉，大幅提升可用性。

**為什麼用 GPT-4o-mini 而非更強的模型？**
SEO 報告生成是結構化任務，輸入資料明確（7 大指標 JSON），GPT-4o-mini 的輸出品質已足夠專業，且成本極低，適合 side project 規模。

---

## License

MIT
