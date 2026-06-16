# Hybrid SEO Dashboard 設計規格

> 專案：nuxt-seo-analyzer  
> 日期：2026-06-16  
> 目標：把現有一次性 SEO 分析工具升級成適合面試展示的 SEO 顧問型 SaaS dashboard，並用 Hybrid provider 模式支援 demo data 與未來真實 API。

---

## 1. 背景與目標

目前系統已具備完整的一次性分析流程：

1. 使用者輸入 domain。
2. `discover` API 從 sitemap 與首頁連結找出 URL。
3. `run` API 透過 SSE 分析多個頁面。
4. 分析結果寫入 Supabase 的 `analysis_sessions` 與 `page_analyses`。
5. 結果頁顯示技術 SEO、Google indexed 狀態、AI 報告，並支援分享與匯出。

下一階段要把產品定位改成「SEO 顧問 / Agency 型 SaaS dashboard」，主要用途是面試作品。第一版應展示產品思維、SEO 專業度與可擴充工程架構，不追求完整商業化功能。

核心目標：

- 中文 dashboard 介面，讓客戶或面試官能快速理解 SEO 狀態。
- 引入專案模型，讓一次性 audit 成為專案底下的分析紀錄。
- 建立 Hybrid provider 架構，沒有 API key 時也能用 demo data 完整展示。
- 預留 Ahrefs、Google Search Console、Crawler/Screaming Frog 的 live integration 邊界。
- 將分析結果轉成顧問可交付的優先修復清單。

---

## 2. 範圍

### 2.1 第一版要做

- 新增 `projects` 概念。
- 新增 `provider_snapshots` 儲存 Ahrefs / GSC / Crawler 摘要資料。
- 新增 `project_tasks` 儲存可追蹤的 SEO 建議事項。
- 讓 `analysis_sessions` 可選擇性掛到 `project_id`。
- Dashboard 改成 SEO 專案總覽。
- 專案詳情頁整合：
  - 技術 SEO audit 摘要。
  - Ahrefs 外部權威摘要。
  - GSC 搜尋成效摘要。
  - Crawler 深度爬蟲摘要。
  - AI 優先修復清單。
- Provider 預設支援 demo mode，未來可切 live mode。
- 顯示 provider 狀態：`demo`、`live`、`imported`、`cached`、`failed`、`stale`。

### 2.2 第一版不做

- 不做完整 Ahrefs live API 全 endpoint。
- 不做完整 GSC OAuth 授權流程。
- 不在 Cloudflare Pages/Nitro server 直接執行 Screaming Frog CLI。
- 不做完整外部 worker queue。
- 不做客戶管理、團隊權限、白牌 PDF、排程監控。
- 不重寫既有 analyze/share/export 流程，只做必要銜接。

---

## 3. 產品結構

### 3.1 Dashboard

`/dashboard` 從目前的網址輸入與最近紀錄，升級為 SEO 專案總覽。

主要區塊：

- 頁首摘要：
  - 今日可分析次數。
  - 專案數。
  - 最近更新時間。
- 專案列表：
  - 專案名稱與主網域。
  - 健康分數。
  - 技術 SEO 問題數。
  - 自然搜尋趨勢摘要。
  - 外部權威摘要。
  - 最近分析狀態。
- 新增專案入口：
  - 專案名稱。
  - 主網域。
  - 目標市場。
  - 競品網域。

介面語言使用中文，指標名稱保留 SEO 常用英文縮寫，例如 DR、CTR、GSC、CWV。

### 3.2 專案詳情頁

建議路由：`/projects/[projectId]`

內容：

- Overview：健康分數、主要風險、最近 audit。
- 技術 SEO：沿用既有 `page_analyses` 的 meta、CWV、robots、schema、headings、images、indexing。
- Ahrefs：DR、backlinks、referring domains、organic keywords、top pages、competitors。
- GSC：clicks、impressions、CTR、average position、top queries、low CTR opportunities。
- Crawler：crawled URLs、broken links、missing metadata、duplicate metadata、redirect chains。
- 工作清單：由 audit/provider/AI 產生的 `project_tasks`。

---

## 4. 資料模型

### 4.1 `projects`

```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_market TEXT,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

用途：

- 代表一個 SEO 顧問專案。
- 讓多次 audit、provider snapshots、tasks 聚合在同一個上下文。

### 4.2 `provider_snapshots`

```sql
CREATE TABLE IF NOT EXISTS provider_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('ahrefs', 'gsc', 'crawler')),
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'live', 'imported')),
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed', 'partial')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);
```

用途：

- 儲存外部或 demo provider 的標準化快照。
- 支援 cache、fallback、stale badge。

### 4.3 `project_tasks`

```sql
CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('audit', 'ahrefs', 'gsc', 'crawler', 'ai')),
  title TEXT NOT NULL,
  description TEXT,
  impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  effort TEXT NOT NULL CHECK (effort IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

用途：

- 把 SEO 報告轉成可追蹤的顧問待辦。
- 展示 impact/effort prioritization。

### 4.4 既有表調整

```sql
ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
```

`analysis_sessions.project_id` 可為 null，保留舊的一次性分析流程。

---

## 5. Provider 架構

新增目錄：

```txt
server/utils/providers/
  shared/
    types.ts
  ahrefs/
    types.ts
    demo.ts
    live.ts
    index.ts
  gsc/
    types.ts
    demo.ts
    live.ts
    index.ts
  crawler/
    types.ts
    demo.ts
    import.ts
    index.ts
```

統一回傳格式：

```ts
export type ProviderName = 'ahrefs' | 'gsc' | 'crawler'
export type ProviderMode = 'demo' | 'live' | 'imported'
export type ProviderStatus = 'ready' | 'failed' | 'partial'

export interface SeoProviderResult<T> {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  cached: boolean
  fetchedAt: string
  expiresAt?: string | null
  data: T
  error?: string
}
```

Mode selection 規則：

- Ahrefs：
  - 有 `NUXT_AHREFS_API_KEY` 且 live mode 啟用時使用 live provider。
  - 否則使用 demo provider。
- GSC：
  - 第一版預設 demo provider。
  - 未來完成 OAuth 後才啟用 live provider。
- Crawler：
  - 第一版預設 demo provider。
  - CSV 匯入可回傳 `imported` mode。
  - Screaming Frog CLI runner 留到外部 worker 版本。

---

## 6. Provider 第一版資料

### 6.1 Ahrefs Provider

Demo/live 標準化資料：

```ts
interface AhrefsSnapshot {
  domainRating: number
  backlinks: number
  referringDomains: number
  organicKeywords: number
  organicTrafficEstimate: number
  topPages: Array<{
    url: string
    traffic: number
    keywords: number
  }>
  competitors: Array<{
    domain: string
    overlapScore: number
  }>
}
```

### 6.2 GSC Provider

```ts
interface GscSnapshot {
  clicks: number
  impressions: number
  ctr: number
  averagePosition: number
  topQueries: Array<{
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  opportunities: Array<{
    query: string
    reason: string
    page?: string
  }>
}
```

### 6.3 Crawler Provider

```ts
interface CrawlerSnapshot {
  crawledUrls: number
  brokenLinks: number
  missingTitles: number
  missingDescriptions: number
  duplicateTitles: number
  duplicateDescriptions: number
  redirectChains: number
  topIssues: Array<{
    type: string
    count: number
    sampleUrls: string[]
  }>
}
```

---

## 7. API 設計

新增 API：

```txt
GET  /api/projects
POST /api/projects
GET  /api/projects/[projectId]
POST /api/projects/[projectId]/audit
POST /api/projects/[projectId]/providers/refresh
GET  /api/projects/[projectId]/tasks
PATCH /api/projects/[projectId]/tasks/[taskId]
```

第一版行為：

- `POST /api/projects`
  - 建立 project。
  - 自動產生 demo provider snapshots。
  - 可產生初始 project tasks。
- `POST /api/projects/[projectId]/audit`
  - 沿用現有 discover/analyze 流程，建立 `analysis_sessions.project_id`。
- `POST /providers/refresh`
  - 依 provider mode selection 更新 snapshot。
  - 失敗時保留舊 snapshot，並寫入 failed snapshot 或 error 狀態。

---

## 8. 錯誤處理

- 沒有 Ahrefs key：顯示「Demo 資料」，不視為錯誤。
- Ahrefs live 失敗：回退 cached 或 demo snapshot，標示 provider failed。
- GSC 未授權：顯示 demo 或「尚未連接 Search Console」。
- Crawler live 不可用：顯示 demo 或 CSV 匯入入口。
- Snapshot 過期：顯示 stale badge，允許手動 refresh。
- Project not found 或非 owner：回傳 404，避免洩漏資源存在。

---

## 9. 測試策略

Server unit tests：

- provider mode selection：有 key 跑 live，無 key 跑 demo。
- provider response normalization。
- provider snapshot cache/expiry 判斷。
- project 建立時產生 demo snapshots。
- `analysis_sessions.project_id` 可正確寫入。
- RLS/ownership 查詢只回傳自己的 project。

Frontend/e2e smoke tests：

- Dashboard 顯示專案列表。
- 新增專案後可看到 demo provider 摘要。
- 專案詳情頁顯示技術 SEO、Ahrefs、GSC、Crawler、tasks 區塊。

---

## 10. 分期建議

### Phase 1：專案型 Dashboard 與 Demo Providers

- DB migration。
- Provider shared types。
- Ahrefs/GSC/Crawler demo providers。
- Project APIs。
- Dashboard 改版。
- Project detail page。

### Phase 2：Audit 與 Tasks 整合

- `analysis_sessions.project_id` 串接。
- 專案頁顯示最近 audit。
- 從 audit/provider 結果產生 `project_tasks`。
- 匯出/分享逐步升級為 project report。

### Phase 3：Live Provider 能力

- Ahrefs live provider 最小可用版本。
- GSC OAuth 與 Search Analytics。
- Crawler CSV import。

### Phase 4：外部 Crawler Worker

- 建立外部 worker contract。
- 支援 Screaming Frog CLI job。
- 匯入 crawl export 並標準化成 CrawlerSnapshot。

---

## 11. 面試展示重點

展示時可以強調：

- 將一次性 SEO audit 工具演進成專案型 SaaS。
- Hybrid provider 讓作品不依賴付費 API，但保留真實整合邊界。
- Ahrefs/GSC/Crawler 的資料來源分工清楚：
  - Ahrefs：外部權威與競品。
  - GSC：第一方搜尋成效。
  - Crawler：深度技術 SEO。
- Cloudflare Pages 不適合跑 Screaming Frog CLI，因此用外部 worker/CSV import 作為正確邊界。
- SEO 建議不是只產生文字報告，而是轉成 impact/effort task backlog。

---

## 12. 第一版決策

- 健康分數第一版使用固定權重，不做可調設定：
  - 技術 SEO audit：40%。
  - Ahrefs 外部權威摘要：20%。
  - GSC 搜尋成效摘要：20%。
  - Crawler 深度爬蟲摘要：20%。
- Project report 第一版先沿用既有 Markdown/CSV export 能力，project-level report API 放到 Phase 2。
- Ahrefs live provider 第一個版本優先做 domain overview 與 top pages，不先做完整 backlinks 明細或 organic keywords 明細。
- GSC live provider 第一版不做 OAuth；專案頁先用 demo snapshot 表示資料模型與 UI。
- Crawler live 第一版不跑 Screaming Frog CLI；先用 demo snapshot，Phase 3 再做 CSV import。
