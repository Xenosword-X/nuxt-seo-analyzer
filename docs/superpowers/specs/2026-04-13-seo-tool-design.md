# SEO 分析工具設計文件

> 專案名稱：nuxt-seo-analyzer  
> 建立日期：2026-04-13  
> 定位：中文版單站 SEO 深度分析工具（Side Project）

---

## 一、專案背景與目標

### 背景
市面上主流 SEO 工具（Ahrefs、SEMrush、Screaming Frog）均為英文介面，台灣／華語圈 SEO 從業者使用時需額外理解英文報告。本工具以繁體中文為核心，提供中文 UI 與中文 AI 分析建議，針對熟悉 SEO 的專業用戶設計。

### 目標用戶
熟悉 SEO 的從業者（B 型用戶），功能可偏複雜，操作流程無需過度簡化。

### 核心差異點
- 全繁體中文 UI
- GPT-4o-mini 自動產生中文 SEO 健診報告
- 三引擎降級索引檢查（SerpApi → Apify → ScraperAPI）

---

## 二、技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| 框架 | Nuxt 3 | 全端框架，前後端整合 |
| 前端 | Vue 3 + Tailwind CSS + shadcn-vue | 中文友善元件 |
| 後端 | Nuxt Nitro server routes | 部署為 Cloudflare Workers |
| 認證 | Supabase Auth（Google OAuth2） | 限制登入用戶才能使用 |
| 資料庫 | Supabase（PostgreSQL） | 儲存分析歷史與用量追蹤 |
| HTML 解析 | cheerio | 輕量，適合 Workers 環境 |
| 索引檢查 | SerpApi → Apify → ScraperAPI | 三引擎降級，多組金鑰輪轉 |
| 速度評分 | Google PageSpeed Insights API | 免費，無需付費 |
| AI 報告 | OpenAI GPT-4o-mini | 中文 SEO 建議，成本極低 |
| 部署 | Cloudflare Pages | 免費方案即可 |

---

## 三、使用限制

| 限制項目 | 數值 |
|----------|------|
| 每用戶每天可分析網域數 | 5 個 |
| 每次分析最多選取頁面數 | 10 頁 |
| 頁面清單顯示上限 | 100 頁 |

---

## 四、使用者流程

```
1. 登入（Google OAuth2）
        │
        ▼
2. 輸入網域（dashboard）
        │
        ▼
3. 系統掃描 sitemap.xml + 首頁連結
   → 產生頁面清單（最多 100 頁）
        │
        ▼
4. 使用者勾選要分析的頁面（最多 10 頁）
        │
        ▼
5. 逐頁執行 7 大指標分析 + AI 報告
   （平行執行，完成一頁即顯示）
        │
        ▼
6. 結果顯示 + 存入 Supabase
        │
        ▼
7. 可在「歷史紀錄」回顧 / 比較不同時間點
```

---

## 五、資料庫結構（Supabase）

```sql
-- 每日使用量追蹤
daily_usage (
  id           uuid  PRIMARY KEY,
  user_id      uuid  REFERENCES auth.users,
  date         date,
  domain_count int   DEFAULT 0,
  UNIQUE (user_id, date)
)

-- 分析工作階段
analysis_sessions (
  id          uuid  PRIMARY KEY,
  user_id     uuid  REFERENCES auth.users,
  domain      text,
  status      text,  -- 'pending' | 'running' | 'done' | 'error'
  created_at  timestamptz,
  page_count  int
)

-- 每頁的分析結果
page_analyses (
  id              uuid  PRIMARY KEY,
  session_id      uuid  REFERENCES analysis_sessions,
  url             text,
  meta_tags       jsonb,   -- title, description, og:*, canonical
  core_web_vitals jsonb,   -- FCP, LCP, TBT, CLS, Speed Score
  robots_sitemap  jsonb,   -- robots 允許/封鎖, sitemap 是否存在
  schema_data     jsonb,   -- 偵測到的 JSON-LD 類型清單
  headings        jsonb,   -- H1~H3 結構 + 內部連結數量
  images          jsonb,   -- 總數、缺 alt 數量、缺 alt src 清單
  indexing        jsonb,   -- is_indexed, engine_used, result_count
  ai_report       text,    -- GPT-4o-mini 產生的中文建議
  analyzed_at     timestamptz
)
```

Row Level Security（RLS）需在 Supabase 啟用，確保用戶只能存取自己的資料。

---

## 六、API 路由結構

```
server/api/
├── auth/
│   └── callback.get.js              # Supabase OAuth2 回呼
│
├── analyze/
│   ├── discover.post.js             # 掃 sitemap + 首頁，回傳頁面清單
│   ├── run.post.js                  # 建立 session，觸發逐頁分析
│   └── status/[sessionId].get.js   # 輪詢分析進度
│
├── page/
│   ├── meta.post.js                 # 解析 meta tags（cheerio）
│   ├── cwv.post.js                  # PageSpeed Insights API
│   ├── robots.post.js               # robots.txt + sitemap.xml 驗證
│   ├── schema.post.js               # JSON-LD Schema 偵測
│   ├── headings.post.js             # H1~H3 結構 + 內部連結分析
│   ├── images.post.js               # 圖片 alt 缺漏掃描
│   └── indexing.post.js             # 三引擎降級索引檢查
│
├── report/
│   └── generate.post.js             # 彙整結果 → GPT-4o-mini 中文報告
│
└── history/
    ├── index.get.js                 # 列出歷史 sessions
    ├── [sessionId].get.js          # 取得單一 session 完整結果
    └── compare.post.js              # 比較兩個 session 的差異
```

### 單頁分析執行邏輯（`run.post.js`）

```
建立 session（status: running）
    │
    ▼
對每個選取的頁面，平行執行（Promise.allSettled）：
  ├── meta.post      → 解析 meta tags
  ├── cwv.post       → PageSpeed API
  ├── robots.post    → robots / sitemap
  ├── schema.post    → JSON-LD
  ├── headings.post  → H1~H3 + 內部連結
  ├── images.post    → alt 掃描
  └── indexing.post  → SerpApi → Apify → ScraperAPI
    │
    ▼
全部完成後 → report/generate → GPT-4o-mini
    │
    ▼
存入 Supabase → session status: done
```

---

## 七、索引檢查降級邏輯

與現有專案邏輯相同，以 Node.js 重寫：

```
1. 從環境變數讀取各引擎的金鑰陣列
   SERPAPI_KEYS=["key1","key2",...]
   APIFY_KEYS=[...]
   SCRAPERAPI_KEYS=[...]

2. 依序嘗試 SerpApi → Apify → ScraperAPI
3. 每個引擎內部輪轉多組金鑰
4. 遇到額度耗盡或錯誤時切換下一個引擎
5. 全部失敗才回傳 error 狀態
```

---

## 八、AI 報告（GPT-4o-mini）

- **模型：** gpt-4o-mini
- **輸入：** 該頁面的 7 大指標 JSON 資料
- **輸出：** 繁體中文 SEO 健診建議（整體摘要 + 各問題的具體改善方向）
- **System Prompt 語言：** 繁體中文
- **Prompt Caching：** 系統提示詞固定，可啟用 caching 降低費用

**費用估算：**
- 每頁約 $0.001（3000 token 輸入 + 800 token 輸出）
- 每用戶每天上限 50 頁（5 網域 × 10 頁）→ 約 $0.05/用戶/天

---

## 九、前端頁面結構

```
pages/
├── index.vue                      # 登入頁（Google OAuth2）
├── dashboard.vue                  # 主頁：輸入網域 + 歷史清單
├── analyze/
│   ├── discover.vue               # 頁面選擇（勾選 sitemap 結果）
│   ├── running.vue                # 分析進行中（逐頁進度）
│   └── result/
│       └── [sessionId].vue        # 完整分析報告頁
└── history/
    └── index.vue                  # 歷史紀錄 + 比較功能
```

### 報告頁面佈局（`result/[sessionId].vue`）

```
┌─────────────────────────────────────────┐
│  example.com — 分析報告                  │
│  2026-04-13 14:32 ｜ 共 5 頁            │
├─────────────────────────────────────────┤
│  🤖 AI 中文健診摘要（整站概覽）           │
├──────────┬──────────────────────────────┤
│  頁面列表 │  選取頁面的詳細指標           │
│          │                              │
│ ✅ /     │  Meta 標籤    ████  80分      │
│ ⚠️ /blog │  Core CWV    ███   65分      │
│ ❌ /about│  索引狀態    ✅ 已收錄        │
│          │  Schema      ✅ Article      │
│          │  標題結構    ⚠️ 缺少 H1      │
│          │  圖片 Alt    ❌ 3 張缺漏     │
│          │  Robots      ✅ 正常          │
│          │                              │
│          │  📋 本頁 AI 建議              │
│          │  （具體改善建議）             │
└──────────┴──────────────────────────────┘
```

---

## 十、環境變數清單

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# 索引檢查（JSON 陣列格式）
SERPAPI_KEYS=
APIFY_KEYS=
SCRAPERAPI_KEYS=

# Google PageSpeed Insights
PAGESPEED_API_KEY=

# 應用程式設定
APP_DAILY_DOMAIN_LIMIT=5
APP_MAX_PAGES_PER_RUN=10
```

---

## 十一、待確認事項

- Cloudflare Workers 的 CPU 時間限制（10ms 免費 / 50ms 付費）是否足夠 cheerio 解析複雜頁面；若不足，需考慮將爬蟲 API 搬到 Railway
- SerpApi / Apify / ScraperAPI 各金鑰格式與呼叫方式需在實作前確認（與現有 Python 版本對齊）
