# 全站自動分析 + 整站收錄量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 nuxt-seo-analyzer 從「手選頁面分析」改為「輸入網域即全站自動分析」，新增整站 Google 收錄量查詢（含 24h 快取）、SSE 即時推送分析進度、整站一份 AI 報告、CSV / Markdown 匯出。

**Architecture:** 維持 Nuxt 3 + Cloudflare Pages（Workers runtime）。`discover.post.ts` 建立 session 後直接跳 `/analyze/running`；`run.post.ts` 改 SSE 串流，平行啟動「整站收錄查詢（含快取）」與「每頁 7 指標分析（每批 5 頁）」；全部完成後呼叫 OpenAI 產整站中文報告。新增全域共享的 `domain_indexing_cache` 資料表，三引擎順序改為 **SerpApi → ScraperAPI → Apify**（對齊 Python 參考實作）。

**Tech Stack:** Nuxt 3、TypeScript、Supabase（PostgreSQL + Auth）、Tailwind + @nuxt/ui、p-limit、cheerio、OpenAI GPT-4o-mini、Vitest

**Spec 參考：** `docs/superpowers/specs/2026-04-14-full-site-analysis-design.md`

---

## 檔案結構（本計畫將建立/修改的檔案）

```
nuxt-seo-analyzer/
├── nuxt.config.ts                                 # 修改：新增 runtimeConfig 項
├── .env.example                                   # 修改：新增環境變數
├── package.json                                   # 修改：新增 p-limit
├── app/
│   ├── app.config.ts                              # 修改：新增 success/warning/danger color
│   └── pages/
│       ├── dashboard.vue                          # 修改：流程改跳 running
│       ├── analyze/
│       │   ├── discover.vue                       # 刪除
│       │   ├── running.vue                        # 大改：SSE 接收
│       │   └── result/[sessionId].vue             # 修改：新增整站卡 + 匯出按鈕
│       └── history/index.vue                      # 修改：顯示收錄摘要
├── supabase/
│   └── schema.sql                                 # 修改：追加 migration
├── server/
│   ├── api/
│   │   ├── analyze/
│   │   │   ├── discover.post.ts                   # 修改：建立 session、回 sessionId
│   │   │   ├── run.post.ts                        # 大改：SSE 串流
│   │   │   └── status/[sessionId].get.ts         # 修改：回傳整站收錄欄位
│   │   ├── domain/
│   │   │   └── indexing.post.ts                   # 新增
│   │   └── export/
│   │       └── [sessionId].get.ts                 # 新增
│   └── utils/
│       ├── domain.ts                              # 新增：網域正規化
│       ├── indexing/
│       │   ├── types.ts                           # 新增
│       │   ├── serpapi.ts                         # 新增
│       │   ├── scraperapi.ts                      # 新增
│       │   ├── apify.ts                           # 新增
│       │   ├── engine.ts                          # 新增：三引擎降級 orchestrator
│       │   └── cache.ts                           # 新增：快取讀寫
│       ├── sse.ts                                 # 新增：SSE event helper
│       ├── report.ts                              # 大改：整站一份報告
│       └── export/
│           ├── csv.ts                             # 新增
│           └── markdown.ts                        # 新增
└── tests/
    ├── server/
    │   └── utils/
    │       ├── domain.test.ts                     # 新增
    │       ├── indexing/
    │       │   ├── engine.test.ts                 # 新增
    │       │   ├── cache.test.ts                  # 新增
    │       │   └── serpapi.test.ts                # 新增
    │       ├── export/
    │       │   ├── csv.test.ts                    # 新增
    │       │   └── markdown.test.ts               # 新增
    │       └── sse.test.ts                        # 新增
```

---

# Phase A：資料層

## Task A1：資料庫 schema 變動

**Files:**
- Modify: `supabase/schema.sql`（追加新表與 ALTER 語句）

- [ ] **Step 1：在 `supabase/schema.sql` 底部追加 migration 區塊**

在檔案最後加上：

```sql
-- ========================================
-- 2026-04-14 Migration：全站分析 + 整站收錄量
-- ========================================

-- 整站收錄量快取（跨用戶全域共享）
CREATE TABLE IF NOT EXISTS domain_indexing_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          TEXT UNIQUE NOT NULL,
  pages_indexed   INT,
  images_indexed  INT,
  engine_used     TEXT,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_cache_lookup
  ON domain_indexing_cache(domain, expires_at);

-- 全域讀取公開、寫入限 service role
ALTER TABLE domain_indexing_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "domain_cache_read_all" ON domain_indexing_cache
  FOR SELECT USING (true);

-- analysis_sessions 擴充欄位
ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS site_pages_indexed   INT,
  ADD COLUMN IF NOT EXISTS site_images_indexed  INT,
  ADD COLUMN IF NOT EXISTS site_indexing_engine TEXT,
  ADD COLUMN IF NOT EXISTS site_indexing_cached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_report            TEXT;
```

- [ ] **Step 2：在 Supabase Dashboard 執行**

1. 開啟 [Supabase Dashboard](https://app.supabase.com) → SQL Editor
2. 複製貼上**僅新增的 migration 區塊**（以 `-- 2026-04-14 Migration` 開頭至檔末）
3. Run
4. Table Editor 中確認 `domain_indexing_cache` 表已建立、`analysis_sessions` 多出 5 個新欄位

- [ ] **Step 3：Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add domain_indexing_cache and site-wide indexing columns"
```

---

## Task A2：runtimeConfig 與環境變數

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Modify: `package.json`

- [ ] **Step 1：安裝 `p-limit`**

```bash
npm install p-limit
```

- [ ] **Step 2：在 `nuxt.config.ts` 的 `runtimeConfig` 中新增項目**

找到既有 `runtimeConfig` 區塊，在 `appMaxPagesPerRun` 後面加：

```ts
runtimeConfig: {
  // （保留既有項目）
  openaiApiKey: '',
  serpApiKeys: '',
  apifyKeys: '',
  scraperApiKeys: '',
  pagespeedApiKey: '',
  supabaseServiceRoleKey: '',
  appDailyDomainLimit: '5',
  appMaxPagesPerRun: '30',              // 修改：從 10 改 30
  domainCacheTtlHours: '24',            // 新增
  siteIndexingEnabled: 'true',          // 新增
},
```

- [ ] **Step 3：在 `.env.example` 對應追加**

```env
# 新增：全站分析設定
NUXT_APP_MAX_PAGES_PER_RUN=30
NUXT_DOMAIN_CACHE_TTL_HOURS=24
NUXT_SITE_INDEXING_ENABLED=true
```

- [ ] **Step 4：Commit**

```bash
git add nuxt.config.ts .env.example package.json package-lock.json
git commit -m "chore(config): add runtime config for full-site analysis"
```

---

# Phase B：整站收錄引擎

## Task B1：網域正規化 util

**Files:**
- Create: `server/utils/domain.ts`
- Create: `tests/server/utils/domain.test.ts`

- [ ] **Step 1：先寫失敗測試 `tests/server/utils/domain.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeDomain } from '../../../server/utils/domain'

describe('normalizeDomain', () => {
  it('去除 https:// 協議', () => {
    expect(normalizeDomain('https://example.com')).toBe('example.com')
  })

  it('去除 http:// 協議', () => {
    expect(normalizeDomain('http://example.com')).toBe('example.com')
  })

  it('去除 www. 前綴', () => {
    expect(normalizeDomain('https://www.example.com')).toBe('example.com')
  })

  it('去除尾端斜線與路徑', () => {
    expect(normalizeDomain('https://example.com/path')).toBe('example.com')
  })

  it('轉為小寫', () => {
    expect(normalizeDomain('Example.COM')).toBe('example.com')
  })

  it('trim 空白', () => {
    expect(normalizeDomain('  example.com  ')).toBe('example.com')
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

```bash
npx vitest run tests/server/utils/domain.test.ts
```

Expected: FAIL，`Cannot find module` 或 `normalizeDomain is not a function`

- [ ] **Step 3：實作 `server/utils/domain.ts`**

```ts
// server/utils/domain.ts
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.split('/')[0]  // 去路徑
  d = d.split('?')[0]  // 去 query
  return d
}
```

- [ ] **Step 4：跑測試確認通過**

```bash
npx vitest run tests/server/utils/domain.test.ts
```

Expected: PASS（6 個測試全綠）

- [ ] **Step 5：Commit**

```bash
git add server/utils/domain.ts tests/server/utils/domain.test.ts
git commit -m "feat(utils): add normalizeDomain utility"
```

---

## Task B2：整站索引引擎型別與 SerpApi client

**Files:**
- Create: `server/utils/indexing/types.ts`
- Create: `server/utils/indexing/serpapi.ts`
- Create: `tests/server/utils/indexing/serpapi.test.ts`

- [ ] **Step 1：建立 `server/utils/indexing/types.ts`**

```ts
// server/utils/indexing/types.ts
export type IndexingEngine = 'serpapi' | 'scraperapi' | 'apify'

export interface DomainIndexingResult {
  pagesIndexed: number | null
  imagesIndexed: number | null
  engineUsed: IndexingEngine | null
  error?: string
}

export interface EngineCheckResult {
  pagesIndexed: number
  imagesIndexed: number
}

export const QUOTA_KEYWORDS = [
  '429', 'quota', 'limit', '403', '402', '401',
  'unauthorized', 'not-enough-usage', 'token',
]

export function isQuotaError(message: string): boolean {
  const lower = message.toLowerCase()
  return QUOTA_KEYWORDS.some((kw) => lower.includes(kw))
}
```

- [ ] **Step 2：寫失敗測試 `tests/server/utils/indexing/serpapi.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkViaSerpApi } from '../../../../server/utils/indexing/serpapi'

describe('checkViaSerpApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('回傳網頁收錄數（由 search_information.total_results）', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search_information: { total_results: 1250 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images_results: Array(45).fill({}) }),
      }) as any

    const result = await checkViaSerpApi('example.com', ['key1'])
    expect(result).toEqual({ pagesIndexed: 1250, imagesIndexed: 45 })
  })

  it('網頁為 0 時不查圖片', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ search_information: { total_results: 0 } }),
    }) as any

    const result = await checkViaSerpApi('example.com', ['key1'])
    expect(result).toEqual({ pagesIndexed: 0, imagesIndexed: 0 })
    expect((global.fetch as any).mock.calls.length).toBe(1)
  })

  it('遇到 429 時切下一把金鑰', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limit' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ search_information: { total_results: 500 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images_results: [] }),
      }) as any

    const result = await checkViaSerpApi('example.com', ['bad', 'good'])
    expect(result?.pagesIndexed).toBe(500)
  })

  it('所有金鑰失敗時回傳 null', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429, text: async () => 'quota exceeded',
    }) as any

    const result = await checkViaSerpApi('example.com', ['k1', 'k2'])
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3：確認測試失敗**

```bash
npx vitest run tests/server/utils/indexing/serpapi.test.ts
```

Expected: FAIL

- [ ] **Step 4：實作 `server/utils/indexing/serpapi.ts`**

```ts
// server/utils/indexing/serpapi.ts
import type { EngineCheckResult } from './types'
import { isQuotaError } from './types'

const SERP_URL = 'https://serpapi.com/search.json'
const DELAY_MS = 500

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function queryPages(domain: string, key: string): Promise<number> {
  const url = `${SERP_URL}?engine=google&q=${encodeURIComponent(`site:${domain}`)}&api_key=${key}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${text.slice(0, 200)}`)
  }
  const data: any = await res.json()
  return Number(data?.search_information?.total_results ?? 0)
}

async function queryImages(domain: string, key: string): Promise<number> {
  const url = `${SERP_URL}?engine=google_images&q=${encodeURIComponent(`site:${domain}`)}&api_key=${key}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${text.slice(0, 200)}`)
  }
  const data: any = await res.json()
  return Array.isArray(data?.images_results) ? data.images_results.length : 0
}

export async function checkViaSerpApi(
  domain: string,
  keys: string[],
): Promise<EngineCheckResult | null> {
  for (const key of keys) {
    try {
      const pages = await queryPages(domain, key)
      await sleep(DELAY_MS)
      const images = pages > 0 ? await queryImages(domain, key) : 0
      return { pagesIndexed: pages, imagesIndexed: images }
    } catch (e: any) {
      if (isQuotaError(e.message)) {
        continue
      }
      // 非配額錯誤也切下一把（保守策略，對齊 Python 版）
      continue
    }
  }
  return null
}
```

- [ ] **Step 5：跑測試**

```bash
npx vitest run tests/server/utils/indexing/serpapi.test.ts
```

Expected: PASS（4 個測試）

- [ ] **Step 6：Commit**

```bash
git add server/utils/indexing/ tests/server/utils/indexing/serpapi.test.ts
git commit -m "feat(indexing): add SerpApi domain indexing client"
```

---

## Task B3：ScraperAPI 與 Apify clients

**Files:**
- Create: `server/utils/indexing/scraperapi.ts`
- Create: `server/utils/indexing/apify.ts`

- [ ] **Step 1：建立 `server/utils/indexing/scraperapi.ts`**

```ts
// server/utils/indexing/scraperapi.ts
import * as cheerio from 'cheerio'
import type { EngineCheckResult } from './types'
import { isQuotaError } from './types'

const SCRAPER_URL = 'https://api.scraperapi.com'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function extractTotalFromHtml(html: string): number {
  const $ = cheerio.load(html)
  const statsText = $('#result-stats').text() || $('div[role=status]').text()
  const m = statsText.match(/約?\s*([\d,]+)\s*[項個筆]/)
  if (m) return Number(m[1].replace(/,/g, ''))
  // 退而求其次：計算 h3 數量（這頁最多 10 筆）
  const h3Count = $('h3').length
  return h3Count > 0 ? h3Count : 0
}

function extractImageCountFromHtml(html: string): number {
  const $ = cheerio.load(html)
  let count = $('img.YQ4gaf[alt]').length
  if (count === 0) count = $('.ivg-i').length
  if (count === 0) count = $('.eA0Zlc').length
  return count
}

async function fetchHtml(query: string, isImages: boolean, key: string, attempt = 0): Promise<string> {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}${isImages ? '&tbm=isch' : ''}`
  const url = `${SCRAPER_URL}?api_key=${key}&url=${encodeURIComponent(googleUrl)}`
  const res = await fetch(url)
  if (res.status === 429 && attempt < 3) {
    await sleep(Math.pow(2, attempt) * 1000)
    return fetchHtml(query, isImages, key, attempt + 1)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${text.slice(0, 200)}`)
  }
  return res.text()
}

export async function checkViaScraperApi(
  domain: string,
  keys: string[],
): Promise<EngineCheckResult | null> {
  for (const key of keys) {
    try {
      const pageHtml = await fetchHtml(`site:${domain}`, false, key)
      const pages = extractTotalFromHtml(pageHtml)

      if (pages === 0) return { pagesIndexed: 0, imagesIndexed: 0 }

      await sleep(2000)
      const imgHtml = await fetchHtml(`site:${domain}`, true, key)
      const images = extractImageCountFromHtml(imgHtml)

      return { pagesIndexed: pages, imagesIndexed: images }
    } catch (e: any) {
      if (isQuotaError(e.message)) continue
      continue
    }
  }
  return null
}
```

- [ ] **Step 2：建立 `server/utils/indexing/apify.ts`**

```ts
// server/utils/indexing/apify.ts
import type { EngineCheckResult } from './types'
import { isQuotaError } from './types'

const APIFY_BASE = 'https://api.apify.com/v2/acts'
const GOOGLE_SEARCH_ACTOR = 'apify~google-search-scraper'
const GOOGLE_IMAGES_ACTOR = 'hooli~google-images-scraper'
const MAX_IMAGES = 100

async function runActor(actorId: string, input: any, token: string): Promise<any> {
  const runRes = await fetch(
    `${APIFY_BASE}/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=60`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )
  if (!runRes.ok) {
    const text = await runRes.text()
    throw new Error(`${runRes.status} ${text.slice(0, 200)}`)
  }
  return runRes.json()
}

export async function checkViaApify(
  domain: string,
  keys: string[],
): Promise<EngineCheckResult | null> {
  for (const token of keys) {
    try {
      // 網頁收錄
      const pageItems: any = await runActor(
        GOOGLE_SEARCH_ACTOR,
        { queries: `site:${domain}`, maxPagesPerQuery: 1, resultsPerPage: 10 },
        token,
      )
      const first = Array.isArray(pageItems) && pageItems[0] ? pageItems[0] : null
      const pages = Number(first?.resultsTotal ?? first?.totalResults ?? 0)

      // 異常保護：Apify pages_count > 10 視為異常（對齊 Python 版）
      if (pages > 0 && pages <= 10) {
        throw new Error('apify anomaly: pages_count <= 10 suspected malformed')
      }

      if (pages === 0) return { pagesIndexed: 0, imagesIndexed: 0 }

      // 圖片收錄
      const imgItems: any = await runActor(
        GOOGLE_IMAGES_ACTOR,
        { queries: [`site:${domain}`], maxImages: MAX_IMAGES },
        token,
      )
      const images = Array.isArray(imgItems) ? imgItems.length : 0

      return { pagesIndexed: pages, imagesIndexed: images }
    } catch (e: any) {
      if (isQuotaError(e.message)) continue
      continue
    }
  }
  return null
}
```

注意：Apify 的 Python 版「異常保護」是「`pages_count > 10` 視為異常」，因為正確回傳應該是 Google 的總估計值（通常遠大於 10）。若回傳 ≤10 表示 actor 只抓到實際 10 筆結果，非估計總數。

- [ ] **Step 3：Commit**

```bash
git add server/utils/indexing/scraperapi.ts server/utils/indexing/apify.ts
git commit -m "feat(indexing): add ScraperAPI and Apify domain indexing clients"
```

---

## Task B4：引擎降級 orchestrator

**Files:**
- Create: `server/utils/indexing/engine.ts`
- Create: `tests/server/utils/indexing/engine.test.ts`

- [ ] **Step 1：寫失敗測試 `tests/server/utils/indexing/engine.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../../server/utils/indexing/serpapi')
vi.mock('../../../../server/utils/indexing/scraperapi')
vi.mock('../../../../server/utils/indexing/apify')

import { checkDomainIndexing } from '../../../../server/utils/indexing/engine'
import { checkViaSerpApi } from '../../../../server/utils/indexing/serpapi'
import { checkViaScraperApi } from '../../../../server/utils/indexing/scraperapi'
import { checkViaApify } from '../../../../server/utils/indexing/apify'

describe('checkDomainIndexing', () => {
  it('SerpApi 成功時不呼叫其他引擎', async () => {
    vi.mocked(checkViaSerpApi).mockResolvedValue({ pagesIndexed: 100, imagesIndexed: 10 })
    const r = await checkDomainIndexing('example.com', {
      serpapi: ['a'], scraperapi: ['b'], apify: ['c'],
    })
    expect(r).toEqual({
      pagesIndexed: 100, imagesIndexed: 10, engineUsed: 'serpapi',
    })
    expect(checkViaScraperApi).not.toHaveBeenCalled()
    expect(checkViaApify).not.toHaveBeenCalled()
  })

  it('SerpApi 失敗降級到 ScraperAPI', async () => {
    vi.mocked(checkViaSerpApi).mockResolvedValue(null)
    vi.mocked(checkViaScraperApi).mockResolvedValue({ pagesIndexed: 50, imagesIndexed: 5 })
    const r = await checkDomainIndexing('example.com', {
      serpapi: ['a'], scraperapi: ['b'], apify: ['c'],
    })
    expect(r.engineUsed).toBe('scraperapi')
  })

  it('三引擎全失敗回傳 null 數值', async () => {
    vi.mocked(checkViaSerpApi).mockResolvedValue(null)
    vi.mocked(checkViaScraperApi).mockResolvedValue(null)
    vi.mocked(checkViaApify).mockResolvedValue(null)
    const r = await checkDomainIndexing('example.com', {
      serpapi: ['a'], scraperapi: ['b'], apify: ['c'],
    })
    expect(r).toEqual({
      pagesIndexed: null, imagesIndexed: null, engineUsed: null,
      error: 'all engines exhausted',
    })
  })

  it('沒設定金鑰的引擎自動跳過', async () => {
    vi.mocked(checkViaScraperApi).mockResolvedValue({ pagesIndexed: 10, imagesIndexed: 1 })
    const r = await checkDomainIndexing('example.com', {
      serpapi: [], scraperapi: ['b'], apify: [],
    })
    expect(r.engineUsed).toBe('scraperapi')
    expect(checkViaSerpApi).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2：確認測試失敗**

```bash
npx vitest run tests/server/utils/indexing/engine.test.ts
```

Expected: FAIL

- [ ] **Step 3：實作 `server/utils/indexing/engine.ts`**

```ts
// server/utils/indexing/engine.ts
import type { DomainIndexingResult } from './types'
import { checkViaSerpApi } from './serpapi'
import { checkViaScraperApi } from './scraperapi'
import { checkViaApify } from './apify'

export interface EngineKeys {
  serpapi: string[]
  scraperapi: string[]
  apify: string[]
}

export async function checkDomainIndexing(
  domain: string,
  keys: EngineKeys,
): Promise<DomainIndexingResult> {
  if (keys.serpapi.length > 0) {
    const r = await checkViaSerpApi(domain, keys.serpapi)
    if (r) return { ...r, engineUsed: 'serpapi' }
  }
  if (keys.scraperapi.length > 0) {
    const r = await checkViaScraperApi(domain, keys.scraperapi)
    if (r) return { ...r, engineUsed: 'scraperapi' }
  }
  if (keys.apify.length > 0) {
    const r = await checkViaApify(domain, keys.apify)
    if (r) return { ...r, engineUsed: 'apify' }
  }
  return {
    pagesIndexed: null,
    imagesIndexed: null,
    engineUsed: null,
    error: 'all engines exhausted',
  }
}
```

- [ ] **Step 4：跑測試**

```bash
npx vitest run tests/server/utils/indexing/engine.test.ts
```

Expected: PASS（4 個測試）

- [ ] **Step 5：Commit**

```bash
git add server/utils/indexing/engine.ts tests/server/utils/indexing/engine.test.ts
git commit -m "feat(indexing): add three-engine fallback orchestrator"
```

---

## Task B5：快取層

**Files:**
- Create: `server/utils/indexing/cache.ts`
- Create: `tests/server/utils/indexing/cache.test.ts`

- [ ] **Step 1：寫失敗測試 `tests/server/utils/indexing/cache.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { readCache, writeCache } from '../../../../server/utils/indexing/cache'

function mockSupabase(selectRow: any | null) {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: selectRow, error: null }),
  } as any
}

describe('readCache', () => {
  it('命中未過期快取時回傳資料', async () => {
    const sb = mockSupabase({
      domain: 'example.com',
      pages_indexed: 1250,
      images_indexed: 45,
      engine_used: 'serpapi',
      checked_at: '2026-04-14T10:00:00Z',
    })
    const result = await readCache(sb, 'example.com')
    expect(result?.pagesIndexed).toBe(1250)
    expect(result?.imagesIndexed).toBe(45)
    expect(result?.engineUsed).toBe('serpapi')
  })

  it('未命中回傳 null', async () => {
    const sb = mockSupabase(null)
    const result = await readCache(sb, 'example.com')
    expect(result).toBeNull()
  })
})

describe('writeCache', () => {
  it('呼叫 upsert 並帶入 expires_at', async () => {
    const sb = mockSupabase(null)
    await writeCache(sb, 'example.com', {
      pagesIndexed: 100, imagesIndexed: 5, engineUsed: 'serpapi',
    }, 24)
    expect(sb.upsert).toHaveBeenCalledTimes(1)
    const arg = (sb.upsert as any).mock.calls[0][0]
    expect(arg.domain).toBe('example.com')
    expect(arg.pages_indexed).toBe(100)
    expect(arg.expires_at).toBeDefined()
  })
})
```

- [ ] **Step 2：確認測試失敗**

```bash
npx vitest run tests/server/utils/indexing/cache.test.ts
```

Expected: FAIL

- [ ] **Step 3：實作 `server/utils/indexing/cache.ts`**

```ts
// server/utils/indexing/cache.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { IndexingEngine } from './types'

export interface CachedEntry {
  pagesIndexed: number | null
  imagesIndexed: number | null
  engineUsed: IndexingEngine | null
  checkedAt: string
}

export async function readCache(
  supabase: SupabaseClient,
  domain: string,
): Promise<CachedEntry | null> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('domain_indexing_cache')
    .select('*')
    .eq('domain', domain)
    .gt('expires_at', nowIso)
    .maybeSingle()

  if (error || !data) return null

  return {
    pagesIndexed: data.pages_indexed,
    imagesIndexed: data.images_indexed,
    engineUsed: data.engine_used as IndexingEngine | null,
    checkedAt: data.checked_at,
  }
}

export async function writeCache(
  supabase: SupabaseClient,
  domain: string,
  data: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engineUsed: IndexingEngine | null
  },
  ttlHours: number,
): Promise<void> {
  const now = new Date()
  const expires = new Date(now.getTime() + ttlHours * 3600 * 1000)

  await supabase.from('domain_indexing_cache').upsert({
    domain,
    pages_indexed: data.pagesIndexed,
    images_indexed: data.imagesIndexed,
    engine_used: data.engineUsed,
    checked_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }, { onConflict: 'domain' })
}
```

- [ ] **Step 4：跑測試**

```bash
npx vitest run tests/server/utils/indexing/cache.test.ts
```

Expected: PASS（3 個測試）

- [ ] **Step 5：Commit**

```bash
git add server/utils/indexing/cache.ts tests/server/utils/indexing/cache.test.ts
git commit -m "feat(indexing): add domain indexing cache read/write helpers"
```

---

## Task B6：API 路由 `/api/domain/indexing`

**Files:**
- Create: `server/api/domain/indexing.post.ts`

- [ ] **Step 1：建立 `server/api/domain/indexing.post.ts`**

```ts
// server/api/domain/indexing.post.ts
import { normalizeDomain } from '../../utils/domain'
import { checkDomainIndexing } from '../../utils/indexing/engine'
import { readCache, writeCache } from '../../utils/indexing/cache'

interface Body {
  domain: string
  forceRefresh?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.domain) {
    throw createError({ statusCode: 400, message: '請提供網域' })
  }

  const config = useRuntimeConfig()
  if (config.siteIndexingEnabled !== 'true') {
    return { pagesIndexed: null, imagesIndexed: null, engineUsed: null, cached: false, error: 'disabled' }
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const domain = normalizeDomain(body.domain)

  if (!body.forceRefresh) {
    const cached = await readCache(supabase, domain)
    if (cached) {
      return {
        pagesIndexed: cached.pagesIndexed,
        imagesIndexed: cached.imagesIndexed,
        engineUsed: cached.engineUsed,
        cached: true,
        checkedAt: cached.checkedAt,
      }
    }
  }

  const keys = {
    serpapi: JSON.parse((config.serpApiKeys as string) || '[]'),
    scraperapi: JSON.parse((config.scraperApiKeys as string) || '[]'),
    apify: JSON.parse((config.apifyKeys as string) || '[]'),
  }

  const result = await checkDomainIndexing(domain, keys)

  // 寫快取（即便失敗也寫，讓失敗暫時記住避免短時間反覆打）
  await writeCache(supabase, domain, {
    pagesIndexed: result.pagesIndexed,
    imagesIndexed: result.imagesIndexed,
    engineUsed: result.engineUsed,
  }, Number(config.domainCacheTtlHours))

  return {
    pagesIndexed: result.pagesIndexed,
    imagesIndexed: result.imagesIndexed,
    engineUsed: result.engineUsed,
    cached: false,
    checkedAt: new Date().toISOString(),
  }
})
```

- [ ] **Step 2：啟動 dev 伺服器測試 API**

```bash
npm run dev
```

在另一個終端：

```bash
curl -X POST http://localhost:3000/api/domain/indexing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <你的 Supabase access token>" \
  -d '{"domain":"example.com"}'
```

Expected: JSON 回應 `{ pagesIndexed, imagesIndexed, engineUsed, cached, checkedAt }`

- [ ] **Step 3：Commit**

```bash
git add server/api/domain/indexing.post.ts
git commit -m "feat(api): add POST /api/domain/indexing endpoint"
```

---

# Phase C：SSE 串流

## Task C1：SSE helper 工具

**Files:**
- Create: `server/utils/sse.ts`
- Create: `tests/server/utils/sse.test.ts`

- [ ] **Step 1：寫失敗測試 `tests/server/utils/sse.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { formatSseEvent } from '../../../server/utils/sse'

describe('formatSseEvent', () => {
  it('格式化為 SSE 標準格式', () => {
    const out = formatSseEvent('page_done', { url: 'x', index: 1 })
    expect(out).toBe(`event: page_done\ndata: {"url":"x","index":1}\n\n`)
  })

  it('data 可為字串', () => {
    const out = formatSseEvent('ping', 'hello')
    expect(out).toBe(`event: ping\ndata: "hello"\n\n`)
  })
})
```

- [ ] **Step 2：確認失敗**

```bash
npx vitest run tests/server/utils/sse.test.ts
```

Expected: FAIL

- [ ] **Step 3：實作 `server/utils/sse.ts`**

```ts
// server/utils/sse.ts
export function formatSseEvent(event: string, data: unknown): string {
  const payload = typeof data === 'string' ? JSON.stringify(data) : JSON.stringify(data)
  return `event: ${event}\ndata: ${payload}\n\n`
}

export interface SseWriter {
  send: (event: string, data: unknown) => void
  close: () => void
}

export function createSseStream(): { stream: ReadableStream<Uint8Array>; writer: SseWriter } {
  const encoder = new TextEncoder()
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
    },
  })
  const writer: SseWriter = {
    send: (event, data) => {
      controllerRef?.enqueue(encoder.encode(formatSseEvent(event, data)))
    },
    close: () => {
      try {
        controllerRef?.close()
      } catch {
        /* noop */
      }
    },
  }
  return { stream, writer }
}
```

- [ ] **Step 4：跑測試**

```bash
npx vitest run tests/server/utils/sse.test.ts
```

Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add server/utils/sse.ts tests/server/utils/sse.test.ts
git commit -m "feat(utils): add SSE event formatter and stream helper"
```

---

## Task C2：`discover.post.ts` 改為建立 session

**Files:**
- Modify: `server/api/analyze/discover.post.ts`

目的：discover 不再只回傳頁面清單，而是**直接建立 session** 並回 `sessionId`，讓前端可直接跳轉到 `/analyze/running`。

- [ ] **Step 1：覆寫 `server/api/analyze/discover.post.ts`**

```ts
// server/api/analyze/discover.post.ts
interface DiscoverBody {
  domain: string
}

export default defineEventHandler(async (event) => {
  const supabase = useServerSupabase()
  const config = useRuntimeConfig()

  const body = await readBody<DiscoverBody>(event)
  if (!body?.domain) {
    throw createError({ statusCode: 400, message: '請輸入網域' })
  }

  let domain = body.domain.trim()
  if (!domain.startsWith('http')) domain = `https://${domain}`

  try {
    new URL(domain)
  } catch {
    throw createError({ statusCode: 400, message: '網域格式不正確' })
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  // 先掃頁面
  const [sitemapUrls, homepageLinks] = await Promise.all([
    fetchSitemapUrls(domain),
    fetchHomepageLinks(domain),
  ])

  const seen = new Set<string>()
  const pages: string[] = []
  for (const u of sitemapUrls) {
    if (!seen.has(u.loc)) { seen.add(u.loc); pages.push(u.loc) }
  }
  for (const link of homepageLinks) {
    if (!seen.has(link)) { seen.add(link); pages.push(link) }
  }

  const maxPages = Number(config.appMaxPagesPerRun)
  const totalFound = pages.length
  const limited = pages.slice(0, maxPages)

  if (limited.length === 0) {
    throw createError({ statusCode: 404, message: '找不到可分析的頁面（無 sitemap 且首頁無內部連結）' })
  }

  // 扣額度
  await incrementUsage(user.id, Number(config.appDailyDomainLimit))

  // 建立 session
  const { data: session, error: sessionError } = await supabase
    .from('analysis_sessions')
    .insert({
      user_id: user.id,
      domain,
      status: 'running',
      page_count: limited.length,
    })
    .select()
    .single()

  if (sessionError || !session) {
    throw createError({ statusCode: 500, message: '建立分析工作階段失敗' })
  }

  return {
    sessionId: session.id,
    domain,
    pageCount: limited.length,
    totalFound,
    maxPages,
    urls: limited,
  }
})
```

- [ ] **Step 2：Commit**

```bash
git add server/api/analyze/discover.post.ts
git commit -m "feat(api): discover now creates session and returns sessionId"
```

---

## Task C3：`run.post.ts` 改為 SSE 串流

**Files:**
- Modify: `server/api/analyze/run.post.ts`

這是 Phase C 最大的一個變更。`run.post.ts` 接收 `sessionId` 與 `urls`，回傳 `text/event-stream`，內部：
1. 推 `session_started`
2. 平行啟動「整站收錄（讀快取 or 打三引擎）」與「每頁分析（每批 5 並行）」
3. 每完成一頁推 `page_done` 並寫 DB
4. 整站收錄完成推 `site_indexing` 並更新 session 欄位
5. 全頁完成後呼叫 AI 報告 → 推 `ai_report_ready`
6. 推 `session_done` → 關閉串流

- [ ] **Step 1：覆寫 `server/api/analyze/run.post.ts`**

```ts
// server/api/analyze/run.post.ts
import pLimit from 'p-limit'
import { createSseStream } from '../../utils/sse'
import { normalizeDomain } from '../../utils/domain'
import { checkDomainIndexing } from '../../utils/indexing/engine'
import { readCache, writeCache } from '../../utils/indexing/cache'
import { generateSiteReport } from '../../utils/report'
import type {
  PageAnalysisResult, MetaTagsResult, CWVResult, RobotsSitemapResult,
  SchemaResult, HeadingsResult, ImagesResult, IndexingResult,
} from '../../utils/analyzers/types'

interface RunBody {
  sessionId: string
  domain: string
  urls: string[]
}

const PAGE_BATCH_CONCURRENCY = 5

export default defineEventHandler(async (event) => {
  const body = await readBody<RunBody>(event)
  if (!body?.sessionId || !body?.domain || !body?.urls?.length) {
    throw createError({ statusCode: 400, message: '缺少必要參數' })
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const config = useRuntimeConfig()
  const { stream, writer } = createSseStream()

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')

  // 在背景執行不 await，立刻回傳 stream
  runSseAnalysis(writer, supabase, config, body).catch((e) => {
    console.error('SSE run failed:', e)
    writer.send('fatal_error', { message: String(e?.message || e) })
    writer.close()
  })

  return sendStream(event, stream)
})

async function runSseAnalysis(
  writer: ReturnType<typeof createSseStream>['writer'],
  supabase: ReturnType<typeof useServerSupabase>,
  config: ReturnType<typeof useRuntimeConfig>,
  body: RunBody,
) {
  const { sessionId, domain, urls } = body

  writer.send('session_started', {
    sessionId, pageCount: urls.length, maxPages: Number(config.appMaxPagesPerRun),
  })

  // 平行：整站收錄查詢
  const siteIndexingTask = (async () => {
    if (config.siteIndexingEnabled !== 'true') return
    const normalized = normalizeDomain(domain)
    const cached = await readCache(supabase, normalized)

    if (cached) {
      writer.send('site_indexing', {
        pagesIndexed: cached.pagesIndexed,
        imagesIndexed: cached.imagesIndexed,
        engine: cached.engineUsed,
        cached: true,
        checkedAt: cached.checkedAt,
      })
      await supabase.from('analysis_sessions').update({
        site_pages_indexed: cached.pagesIndexed,
        site_images_indexed: cached.imagesIndexed,
        site_indexing_engine: cached.engineUsed,
        site_indexing_cached: true,
      }).eq('id', sessionId)
      return
    }

    const keys = {
      serpapi: JSON.parse((config.serpApiKeys as string) || '[]'),
      scraperapi: JSON.parse((config.scraperApiKeys as string) || '[]'),
      apify: JSON.parse((config.apifyKeys as string) || '[]'),
    }
    const result = await checkDomainIndexing(normalized, keys)

    await writeCache(supabase, normalized, {
      pagesIndexed: result.pagesIndexed,
      imagesIndexed: result.imagesIndexed,
      engineUsed: result.engineUsed,
    }, Number(config.domainCacheTtlHours))

    await supabase.from('analysis_sessions').update({
      site_pages_indexed: result.pagesIndexed,
      site_images_indexed: result.imagesIndexed,
      site_indexing_engine: result.engineUsed,
      site_indexing_cached: false,
    }).eq('id', sessionId)

    writer.send('site_indexing', {
      pagesIndexed: result.pagesIndexed,
      imagesIndexed: result.imagesIndexed,
      engine: result.engineUsed,
      cached: false,
      checkedAt: new Date().toISOString(),
    })
  })()

  // 平行：每頁分析（分批）
  const pageResults: PageAnalysisResult[] = []
  const limit = pLimit(PAGE_BATCH_CONCURRENCY)
  const pageTasks = urls.map((url, index) => limit(async () => {
    writer.send('page_started', { url, index: index + 1 })

    try {
      const [meta, cwv, robots, schema, headings, images, indexing] = await Promise.allSettled([
        analyzeMeta(url),
        analyzeCWV(url),
        analyzeRobots(url),
        analyzeSchema(url),
        analyzeHeadings(url),
        analyzeImages(url),
        analyzeIndexing(url),
      ])

      const metaTags: MetaTagsResult = meta.status === 'fulfilled' ? meta.value
        : { title: null, description: null, ogTitle: null, ogDescription: null, ogImage: null, canonical: null, robotsMeta: null, score: 0, issues: ['分析失敗'] }
      const coreWebVitals: CWVResult = cwv.status === 'fulfilled' ? cwv.value
        : { fcp: null, lcp: null, tbt: null, cls: null, speedScore: null, issues: ['分析失敗'] }
      const robotsSitemap: RobotsSitemapResult = robots.status === 'fulfilled' ? robots.value
        : { robotsAllowed: true, sitemapExists: false, sitemapUrl: null, issues: ['分析失敗'] }
      const schemaData: SchemaResult = schema.status === 'fulfilled' ? schema.value
        : { types: [], count: 0, issues: ['分析失敗'] }
      const headingsResult: HeadingsResult = headings.status === 'fulfilled' ? headings.value
        : { h1: [], h2Count: 0, h3Count: 0, internalLinkCount: 0, issues: ['分析失敗'] }
      const imagesResult: ImagesResult = images.status === 'fulfilled' ? images.value
        : { total: 0, missingAlt: 0, missingSrcs: [], issues: ['分析失敗'] }
      const indexingResult: IndexingResult = indexing.status === 'fulfilled' ? indexing.value
        : { isIndexed: false, resultCount: null, engineUsed: 'failed', issues: ['分析失敗'] }

      const data: Omit<PageAnalysisResult, 'aiReport'> = {
        url, metaTags, coreWebVitals, robotsSitemap,
        schemaData, headings: headingsResult, images: imagesResult, indexing: indexingResult,
      }

      await supabase.from('page_analyses').insert({
        session_id: sessionId,
        url,
        meta_tags: metaTags,
        core_web_vitals: coreWebVitals,
        robots_sitemap: robotsSitemap,
        schema_data: schemaData,
        headings: headingsResult,
        images: imagesResult,
        indexing: indexingResult,
        ai_report: null,
      })

      pageResults.push({ ...data, aiReport: null as any })
      writer.send('page_done', { url, index: index + 1, analysis: data })
    } catch (e: any) {
      writer.send('page_error', { url, index: index + 1, error: String(e?.message || e) })
    }
  }))

  // 等所有頁面 + 整站收錄完成
  await Promise.allSettled([Promise.all(pageTasks), siteIndexingTask])

  // 取最新 session 以便帶入 AI 報告 prompt 的整站數據
  const { data: sessionRow } = await supabase
    .from('analysis_sessions')
    .select('site_pages_indexed, site_images_indexed, site_indexing_engine')
    .eq('id', sessionId)
    .single()

  // AI 整站報告
  try {
    const report = await generateSiteReport({
      domain,
      siteIndexing: {
        pagesIndexed: sessionRow?.site_pages_indexed ?? null,
        imagesIndexed: sessionRow?.site_images_indexed ?? null,
        engine: sessionRow?.site_indexing_engine ?? null,
      },
      pages: pageResults,
    })
    await supabase.from('analysis_sessions').update({ ai_report: report }).eq('id', sessionId)
    writer.send('ai_report_ready', { report })
  } catch (e: any) {
    writer.send('ai_report_error', { error: String(e?.message || e) })
  }

  await supabase.from('analysis_sessions').update({ status: 'done' }).eq('id', sessionId)
  writer.send('session_done', { sessionId, status: 'done' })
  writer.close()
}
```

- [ ] **Step 2：Commit**

```bash
git add server/api/analyze/run.post.ts
git commit -m "feat(api): run.post.ts refactored to SSE streaming with parallel site indexing"
```

---

## Task C4：`status/[sessionId].get.ts` 回傳整站欄位

**Files:**
- Modify: `server/api/analyze/status/[sessionId].get.ts`

- [ ] **Step 1：開啟檔案並確認目前回傳結構**

```bash
cat server/api/analyze/status/\[sessionId\].get.ts
```

- [ ] **Step 2：修改 SELECT，加入新欄位**

在既有的 `.from('analysis_sessions').select(...)` 子句中確認帶回 `site_pages_indexed, site_images_indexed, site_indexing_engine, site_indexing_cached, ai_report`（可直接用 `select('*')`）。

範例目標形態：

```ts
const { data: session } = await supabase
  .from('analysis_sessions')
  .select('*')
  .eq('id', sessionId)
  .single()

const { data: analyses } = await supabase
  .from('page_analyses')
  .select('*')
  .eq('session_id', sessionId)

return { session, analyses }
```

- [ ] **Step 3：Commit**

```bash
git add server/api/analyze/status/\[sessionId\].get.ts
git commit -m "feat(api): status endpoint returns site-wide indexing fields"
```

---

# Phase D：前端改版

## Task D1：`app/app.config.ts` 補色彩 token

**Files:**
- Modify: `app/app.config.ts`

- [ ] **Step 1：確認 / 修改 `app/app.config.ts`**

```ts
// app/app.config.ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'sky',
      success: 'emerald',
      warning: 'amber',
      danger: 'rose',
      neutral: 'slate',
    },
  },
})
```

- [ ] **Step 2：Commit**

```bash
git add app/app.config.ts
git commit -m "style: add semantic color tokens (success/warning/danger)"
```

---

## Task D2：刪除 discover.vue，dashboard 直接跳 running

**Files:**
- Delete: `app/pages/analyze/discover.vue`
- Modify: `app/pages/dashboard.vue`

- [ ] **Step 1：刪除 `app/pages/analyze/discover.vue`**

```bash
rm app/pages/analyze/discover.vue
```

- [ ] **Step 2：修改 `app/pages/dashboard.vue` 的 `startDiscover` 函式**

找到 `<script setup>` 中 `startDiscover` 方法，改為：

```ts
async function startDiscover() {
  if (!domain.value.trim() || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await $fetch<{
      sessionId: string
      domain: string
      pageCount: number
      totalFound: number
      maxPages: number
      urls: string[]
    }>('/api/analyze/discover', {
      method: 'POST',
      body: { domain: domain.value.trim() },
      headers: { Authorization: `Bearer ${token}` },
    })

    // 存 urls 在 sessionStorage，running 頁會讀取去打 /api/analyze/run
    sessionStorage.setItem(`analysis:${res.sessionId}`, JSON.stringify({
      urls: res.urls, domain: res.domain, pageCount: res.pageCount, totalFound: res.totalFound,
    }))

    await navigateTo(`/analyze/running?sessionId=${res.sessionId}`)
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || '分析啟動失敗'
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 3：在瀏覽器手動驗證**

```bash
npm run dev
```

1. 登入後在 dashboard 輸入 `example.com`
2. 點「開始分析」→ 應直接跳到 `/analyze/running?sessionId=...`（running 頁會是空白，下一個 task 填內容）

- [ ] **Step 4：Commit**

```bash
git add app/pages/dashboard.vue
git rm app/pages/analyze/discover.vue
git commit -m "feat(ui): remove page-selection step, dashboard goes directly to running"
```

---

## Task D3：`running.vue` 大改 — SSE + 整站卡 + 頁面進度

**Files:**
- Modify: `app/pages/analyze/running.vue`

這是本計畫中前端最大的一個變更。

- [ ] **Step 1：覆寫 `app/pages/analyze/running.vue`**

```vue
<!-- app/pages/analyze/running.vue -->
<template>
  <div class="min-h-screen" style="background: linear-gradient(135deg, #f8fafc 0%, #f0f9ff 55%, #ecfeff 100%)">

    <header style="background: linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%); box-shadow: 0 4px 20px rgba(3,105,161,0.28)">
      <div class="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <h1 class="text-white font-bold text-base">分析中：{{ domain }}</h1>
        <span class="text-white/70 text-xs tabular-nums">{{ doneCount }}/{{ pageCount }} 頁完成</span>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-6 py-6 space-y-5">

      <!-- 進度條 -->
      <div class="bg-white rounded-2xl p-4 shadow-sm">
        <div class="h-2 bg-sky-100 rounded-full overflow-hidden">
          <div class="h-full bg-sky-500 transition-all duration-300" :style="{ width: progressPct + '%' }" />
        </div>
        <p class="text-xs text-gray-500 mt-2 tabular-nums" aria-live="polite">
          已完成 {{ doneCount }} / {{ pageCount }} 頁（{{ progressPct }}%）
        </p>
      </div>

      <!-- 整站收錄量卡 -->
      <section class="bg-gradient-to-br from-white to-sky-50 rounded-2xl p-6 shadow-md ring-1 ring-sky-100">
        <h2 class="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-sky-600" />
          整站 Google 收錄
        </h2>

        <div v-if="!siteIndexing" class="grid grid-cols-3 gap-8 animate-pulse">
          <div v-for="n in 3" :key="n">
            <div class="h-8 bg-gray-200 rounded w-20 mb-2" />
            <div class="h-3 bg-gray-100 rounded w-16" />
          </div>
        </div>

        <div v-else-if="siteIndexing.pagesIndexed === null" class="py-4 text-center">
          <p class="text-sm text-rose-600 font-medium">⚠️ 索引查詢服務暫時無法使用</p>
          <p class="text-xs text-gray-400 mt-1">三引擎皆失敗，請稍後再試</p>
        </div>

        <div v-else class="grid grid-cols-3 gap-8">
          <div>
            <p class="text-3xl font-bold text-sky-700 tabular-nums">{{ formatNumber(siteIndexing.pagesIndexed) }}</p>
            <p class="text-xs text-gray-500 mt-1">網頁收錄</p>
          </div>
          <div>
            <p class="text-3xl font-bold text-sky-700 tabular-nums">{{ formatNumber(siteIndexing.imagesIndexed) }}</p>
            <p class="text-xs text-gray-500 mt-1">圖片收錄</p>
          </div>
          <div>
            <p class="text-3xl font-bold text-gray-700 capitalize">{{ siteIndexing.engine || '—' }}</p>
            <p class="text-xs text-gray-500 mt-1">查詢引擎</p>
          </div>
        </div>

        <p v-if="siteIndexing?.cached" class="text-xs text-gray-400 mt-4">
          💾 使用快取 · {{ formatRelativeTime(siteIndexing.checkedAt) }}
        </p>
      </section>

      <!-- 頁面進度清單 -->
      <section class="bg-white rounded-2xl p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">📄 頁面進度</h2>
        <div class="space-y-1.5">
          <div
            v-for="p in pages"
            :key="p.url"
            class="flex items-center gap-3 h-14 px-3 rounded-xl bg-gray-50 border-l-2"
            :class="statusBorder(p.status)"
          >
            <span class="w-5 text-center">{{ statusIcon(p.status) }}</span>
            <span class="text-sm text-gray-700 truncate flex-1">{{ urlPath(p.url) }}</span>
            <span v-if="p.status === 'done'" class="text-xs text-gray-400 tabular-nums">
              {{ p.issueCount }} 個問題
            </span>
            <span v-else-if="p.status === 'error'" class="text-xs text-rose-500">失敗</span>
          </div>
        </div>
      </section>

      <!-- AI 報告狀態 -->
      <section class="bg-white rounded-2xl p-5 shadow-sm">
        <h2 class="text-sm font-semibold text-gray-700 mb-2">🤖 AI 報告</h2>
        <p v-if="!aiReport && !aiReportError" class="text-sm text-gray-400">
          等待所有頁面完成後產生...
        </p>
        <p v-else-if="aiReportError" class="text-sm text-rose-600">
          ⚠️ AI 報告生成失敗：{{ aiReportError }}
        </p>
        <p v-else class="text-sm text-emerald-600">✅ 已完成，準備跳轉報告頁...</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabaseClient()
const sessionId = String(route.query.sessionId || '')

interface PageRow { url: string; status: 'pending' | 'running' | 'done' | 'error'; issueCount: number }
interface SiteIndexing {
  pagesIndexed: number | null; imagesIndexed: number | null
  engine: string | null; cached: boolean; checkedAt?: string
}

const domain = ref('')
const pageCount = ref(0)
const pages = ref<PageRow[]>([])
const siteIndexing = ref<SiteIndexing | null>(null)
const aiReport = ref<string | null>(null)
const aiReportError = ref<string | null>(null)

const doneCount = computed(() => pages.value.filter((p) => p.status === 'done').length)
const progressPct = computed(() =>
  pageCount.value === 0 ? 0 : Math.round((doneCount.value / pageCount.value) * 100),
)

function urlPath(u: string) {
  try { return new URL(u).pathname || '/' } catch { return u }
}
function statusIcon(s: PageRow['status']) {
  return s === 'done' ? '✅' : s === 'error' ? '✕' : s === 'running' ? '◌' : '⏳'
}
function statusBorder(s: PageRow['status']) {
  return s === 'done' ? 'border-emerald-500'
    : s === 'error' ? 'border-rose-500'
    : s === 'running' ? 'border-sky-400'
    : 'border-gray-300'
}
function formatNumber(n: number | null) {
  return n === null ? '—' : n.toLocaleString('en-US')
}
function formatRelativeTime(iso?: string) {
  if (!iso) return ''
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 60) return `${diffMin} 分鐘前更新`
  return `${Math.floor(diffMin / 60)} 小時前更新`
}
function totalIssues(analysis: any): number {
  const counts = [
    analysis?.metaTags?.issues?.length || 0,
    analysis?.coreWebVitals?.issues?.length || 0,
    analysis?.robotsSitemap?.issues?.length || 0,
    analysis?.schemaData?.issues?.length || 0,
    analysis?.headings?.issues?.length || 0,
    analysis?.images?.issues?.length || 0,
    analysis?.indexing?.issues?.length || 0,
  ]
  return counts.reduce((a, b) => a + b, 0)
}

async function startAnalysis() {
  const cached = sessionStorage.getItem(`analysis:${sessionId}`)
  if (!cached) {
    // 若無快取（例如重新整理），改用 status 端點輪詢
    await pollStatus()
    return
  }
  const info = JSON.parse(cached) as { urls: string[]; domain: string; pageCount: number }
  domain.value = info.domain
  pageCount.value = info.pageCount
  pages.value = info.urls.map((u) => ({ url: u, status: 'pending', issueCount: 0 }))

  const token = (await supabase.auth.getSession()).data.session?.access_token

  // 使用 fetch 取 SSE 流（EventSource 不支援 POST）
  const res = await fetch('/api/analyze/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionId, domain: info.domain, urls: info.urls }),
  })

  if (!res.body) {
    await pollStatus()
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const chunk of parts) {
      handleSseChunk(chunk)
    }
  }
}

function handleSseChunk(chunk: string) {
  const eventMatch = chunk.match(/^event: (.+)$/m)
  const dataMatch = chunk.match(/^data: (.+)$/m)
  if (!eventMatch || !dataMatch) return
  const eventName = eventMatch[1].trim()
  let data: any
  try { data = JSON.parse(dataMatch[1]) } catch { return }

  if (eventName === 'site_indexing') {
    siteIndexing.value = data
  } else if (eventName === 'page_started') {
    const row = pages.value.find((p) => p.url === data.url)
    if (row) row.status = 'running'
  } else if (eventName === 'page_done') {
    const row = pages.value.find((p) => p.url === data.url)
    if (row) {
      row.status = 'done'
      row.issueCount = totalIssues(data.analysis)
    }
  } else if (eventName === 'page_error') {
    const row = pages.value.find((p) => p.url === data.url)
    if (row) row.status = 'error'
  } else if (eventName === 'ai_report_ready') {
    aiReport.value = data.report
  } else if (eventName === 'ai_report_error') {
    aiReportError.value = data.error
  } else if (eventName === 'session_done') {
    sessionStorage.removeItem(`analysis:${sessionId}`)
    setTimeout(() => navigateTo(`/analyze/result/${sessionId}`), 600)
  }
}

async function pollStatus() {
  // SSE 斷線或重新整理 fallback：每 2 秒輪詢
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const interval = setInterval(async () => {
    const res: any = await $fetch(`/api/analyze/status/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const s = res.session
    domain.value = s.domain
    pageCount.value = s.page_count
    if (siteIndexing.value === null && s.site_indexing_engine !== null) {
      siteIndexing.value = {
        pagesIndexed: s.site_pages_indexed,
        imagesIndexed: s.site_images_indexed,
        engine: s.site_indexing_engine,
        cached: s.site_indexing_cached,
      }
    }
    // 依 page_analyses 更新狀態
    const analysesByUrl: Record<string, any> = {}
    for (const a of (res.analyses || [])) analysesByUrl[a.url] = a
    if (pages.value.length === 0 && pageCount.value > 0) {
      pages.value = Object.keys(analysesByUrl).map((u) => ({
        url: u, status: 'done', issueCount: totalIssues(analysesByUrl[u]),
      }))
    }
    if (s.ai_report) aiReport.value = s.ai_report
    if (s.status === 'done') {
      clearInterval(interval)
      setTimeout(() => navigateTo(`/analyze/result/${sessionId}`), 600)
    }
  }, 2000)
}

onMounted(() => {
  if (!sessionId) {
    navigateTo('/dashboard')
    return
  }
  startAnalysis()
})
</script>
```

- [ ] **Step 2：瀏覽器測試**

```bash
npm run dev
```

1. Dashboard 輸入網域 → 開始分析
2. 確認 running 頁顯示：進度條動態更新、整站收錄卡骨架 → 數字（或錯誤）、頁面逐一從 ⏳ 變 ◌ 變 ✅
3. AI 報告完成後自動跳 result 頁

- [ ] **Step 3：Commit**

```bash
git add app/pages/analyze/running.vue
git commit -m "feat(ui): running page with SSE streaming, site indexing card, page progress"
```

---

## Task D4：`result/[sessionId].vue` 加整站收錄卡 + 匯出按鈕

**Files:**
- Modify: `app/pages/analyze/result/[sessionId].vue`

- [ ] **Step 1：讀取目前 template，找到 AI 報告區塊**

```bash
cat app/pages/analyze/result/\[sessionId\].vue | head -100
```

- [ ] **Step 2：在 AI 報告區塊「上方」插入整站收錄卡，在 header 右側加「匯出」下拉選單**

在 template 的主內容區最上方（「左欄頁面清單」與「右側內容」之間）新增整站卡區塊。具體做法：

**2a. 在 header 的 `<div class="flex items-center gap-3">` 後方加匯出按鈕：**

```vue
<!-- 加在 header 右側，原「歷史紀錄 →」按鈕左邊 -->
<UDropdown :items="exportItems">
  <UButton size="xs" color="white" variant="ghost" icon="i-heroicons-arrow-down-tray">
    匯出
  </UButton>
</UDropdown>
```

**2b. 在 main 區最上方（詳細指標上面）插入整站收錄卡：**

```vue
<section v-if="sessionData" class="mb-5 bg-gradient-to-br from-white to-sky-50 rounded-2xl p-6 shadow-md ring-1 ring-sky-100">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
      <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-sky-600" />
      整站 Google 收錄概況
    </h2>
    <UButton size="xs" color="white" variant="ghost" icon="i-heroicons-arrow-path"
             :loading="refreshingIndexing" @click="refreshSiteIndexing">
      重新查詢
    </UButton>
  </div>

  <div v-if="sessionData.site_pages_indexed === null" class="py-3 text-center">
    <p class="text-sm text-rose-600">⚠️ 索引查詢服務暫時無法使用</p>
  </div>

  <div v-else class="grid grid-cols-3 gap-8">
    <div>
      <p class="text-3xl font-bold tabular-nums"
         :class="sessionData.site_pages_indexed <= 1 ? 'text-rose-600' : 'text-sky-700'">
        {{ formatNumber(sessionData.site_pages_indexed) }}
      </p>
      <p class="text-xs text-gray-500 mt-1">網頁收錄</p>
      <p v-if="sessionData.site_pages_indexed <= 1" class="text-xs text-rose-500 mt-1">
        ⚠️ 疑似未被 Google 收錄
      </p>
    </div>
    <div>
      <p class="text-3xl font-bold tabular-nums"
         :class="sessionData.site_images_indexed === 0 ? 'text-amber-600' : 'text-sky-700'">
        {{ formatNumber(sessionData.site_images_indexed) }}
      </p>
      <p class="text-xs text-gray-500 mt-1">圖片收錄</p>
      <p v-if="sessionData.site_images_indexed === 0" class="text-xs text-amber-600 mt-1">
        建議補強圖片 SEO
      </p>
    </div>
    <div>
      <p class="text-3xl font-bold text-gray-700 capitalize">{{ sessionData.site_indexing_engine || '—' }}</p>
      <p class="text-xs text-gray-500 mt-1">查詢引擎</p>
    </div>
  </div>

  <p v-if="sessionData.site_indexing_cached" class="text-xs text-gray-400 mt-4">
    💾 使用快取
  </p>
</section>
```

**2c. 在 `<script setup>` 底部新增邏輯：**

```ts
const refreshingIndexing = ref(false)

function formatNumber(n: number | null) {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-US')
}

async function refreshSiteIndexing() {
  if (refreshingIndexing.value) return
  refreshingIndexing.value = true
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const r: any = await $fetch('/api/domain/indexing', {
      method: 'POST',
      body: { domain: sessionData.value.domain, forceRefresh: true },
      headers: { Authorization: `Bearer ${token}` },
    })
    if (sessionData.value) {
      sessionData.value.site_pages_indexed = r.pagesIndexed
      sessionData.value.site_images_indexed = r.imagesIndexed
      sessionData.value.site_indexing_engine = r.engineUsed
      sessionData.value.site_indexing_cached = r.cached
    }
  } finally {
    refreshingIndexing.value = false
  }
}

const exportItems = [[
  {
    label: '匯出 CSV',
    icon: 'i-heroicons-table-cells',
    click: () => triggerExport('csv'),
  },
  {
    label: '匯出 Markdown',
    icon: 'i-heroicons-document-text',
    click: () => triggerExport('markdown'),
  },
]]

async function triggerExport(format: 'csv' | 'markdown') {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const url = `/api/export/${sessionData.value.id}?format=${format}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return
  const blob = await res.blob()
  const filename =
    res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1]
    || `export.${format}`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
```

- [ ] **Step 3：Commit**

```bash
git add app/pages/analyze/result/\[sessionId\].vue
git commit -m "feat(ui): result page adds site indexing card and export dropdown"
```

---

## Task D5：`history/index.vue` 顯示收錄摘要

**Files:**
- Modify: `app/pages/history/index.vue`

- [ ] **Step 1：讀取目前的 session 卡片渲染區塊**

- [ ] **Step 2：在每張 session 卡片底部追加收錄摘要行**

在卡片模板裡（顯示網域與日期的區塊下方）加入：

```vue
<p v-if="session.site_pages_indexed !== null" class="text-xs text-gray-500 mt-1 tabular-nums">
  收錄：{{ formatNumber(session.site_pages_indexed) }} 頁
  / {{ formatNumber(session.site_images_indexed) }} 圖
</p>
```

並在 `<script setup>` 加 `formatNumber` helper（同 Task D4）。

注意：`api/history/index.get.ts` 若僅 select 特定欄位，需加入新欄位。打開檢查：

```bash
cat server/api/history/index.get.ts
```

若有 `.select('id, domain, status, page_count, created_at')`，改為 `.select('id, domain, status, page_count, created_at, site_pages_indexed, site_images_indexed')` 或直接 `.select('*')`。

- [ ] **Step 3：Commit**

```bash
git add app/pages/history/index.vue server/api/history/index.get.ts
git commit -m "feat(ui): history page shows site indexing summary per session"
```

---

# Phase E：AI 報告調整

## Task E1：整站 AI 報告函式

**Files:**
- Modify: `server/utils/report.ts`

把每頁一份報告改成**整站一份**。既有 `generateAIReport` 保留（向後相容）但不再被使用；新增 `generateSiteReport`。

- [ ] **Step 1：在 `server/utils/report.ts` 追加 `generateSiteReport`**

在檔案末尾新增：

```ts
// server/utils/report.ts（追加在檔案末尾）

interface SiteReportInput {
  domain: string
  siteIndexing: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engine: string | null
  }
  pages: Array<Omit<PageAnalysisResult, 'aiReport'>>
}

export async function generateSiteReport(input: SiteReportInput): Promise<string> {
  const config = useRuntimeConfig()
  const client = new OpenAI({ apiKey: config.openaiApiKey as string })

  // 精簡各頁成 summary，避免 token 爆炸
  const pageSummaries = input.pages.map((p) => ({
    url: p.url,
    metaScore: p.metaTags.score,
    metaIssues: p.metaTags.issues,
    speedScore: p.coreWebVitals.speedScore,
    cwvIssues: p.coreWebVitals.issues,
    robotsIssues: p.robotsSitemap.issues,
    schemaTypes: p.schemaData.types,
    headingIssues: p.headings.issues,
    h1Count: p.headings.h1.length,
    missingAltCount: p.images.missingAlt,
    isIndexed: p.indexing.isIndexed,
  }))

  const userPayload = {
    domain: input.domain,
    siteIndexing: input.siteIndexing,
    pageCount: input.pages.length,
    pages: pageSummaries,
  }

  const SYSTEM_PROMPT = `你是繁體中文 SEO 顧問。根據使用者提供的整站分析資料，產出一份結構化的繁體中文 SEO 健診報告，格式為 Markdown。
報告結構：
## 整體摘要
（3–5 句，點出該站最關鍵的 1–2 個問題）

## 優先改善項目（依影響度排序）
1. **[問題名稱]** — 說明 + 具體改善方向
2. ...

## 各類別檢討
### Meta 標籤
### Core Web Vitals
### 結構化資料 / Schema
### 標題結構（H1–H3）
### 圖片 SEO
### 索引與 robots
### 整站收錄量觀察

## 總結建議
（2–3 句，給一個清晰的下一步行動）

規則：
- 語氣專業、簡潔，不堆砌形容詞
- 針對具體網址或具體數字給建議
- 問題不多時不要硬湊，可略過該類別
- 不輸出 JSON、不要開場白、直接開始 Markdown`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    temperature: 0.3,
  })

  return response.choices[0]?.message?.content?.trim() || '（AI 報告為空）'
}
```

- [ ] **Step 2：快速冒煙測試（選配）**

用 node -e 或開發時實際跑一次分析觀察 Supabase 的 `analysis_sessions.ai_report` 有寫入整站報告內容。

- [ ] **Step 3：Commit**

```bash
git add server/utils/report.ts
git commit -m "feat(report): add generateSiteReport for whole-site Markdown report"
```

---

# Phase F：匯出功能

## Task F1：CSV 匯出 util

**Files:**
- Create: `server/utils/export/csv.ts`
- Create: `tests/server/utils/export/csv.test.ts`

- [ ] **Step 1：寫失敗測試 `tests/server/utils/export/csv.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildCsv } from '../../../../server/utils/export/csv'

describe('buildCsv', () => {
  it('開頭有 UTF-8 BOM', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 1250, imagesIndexed: 45, engine: 'serpapi' },
      analyses: [],
    })
    expect(out.charCodeAt(0)).toBe(0xFEFF)
  })

  it('包含 metadata 註解行', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 1250, imagesIndexed: 45, engine: 'serpapi' },
      analyses: [],
    })
    expect(out).toContain('# 網域：example.com')
    expect(out).toContain('# 整站收錄：1,250 頁 / 45 圖')
  })

  it('每頁一列', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 100, imagesIndexed: 5, engine: 'apify' },
      analyses: [
        {
          url: 'https://example.com/',
          meta_tags: { title: '首頁', description: '描述', issues: [] },
          core_web_vitals: { speedScore: 85, lcp: 1800, cls: 0.05, tbt: 120, issues: [] },
          headings: { h1: ['首頁'], issues: [] },
          indexing: { isIndexed: true, issues: [] },
          schema_data: { types: ['Article'], issues: [] },
          images: { missingAlt: 0, issues: [] },
          robots_sitemap: { issues: [] },
        },
      ],
    })
    const lines = out.split('\n').filter((l) => !l.startsWith('#') && l.trim())
    expect(lines.length).toBe(2) // header + 1 row
    expect(lines[1]).toContain('https://example.com/')
    expect(lines[1]).toContain('首頁')
    expect(lines[1]).toContain('85')
  })

  it('含雙引號的 title 會被正確跳脫', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 0, imagesIndexed: 0, engine: null },
      analyses: [{
        url: 'https://x/',
        meta_tags: { title: '含 " 雙引號', description: null, issues: [] },
        core_web_vitals: { speedScore: null, lcp: null, cls: null, tbt: null, issues: [] },
        headings: { h1: [], issues: [] },
        indexing: { isIndexed: false, issues: [] },
        schema_data: { types: [], issues: [] },
        images: { missingAlt: 0, issues: [] },
        robots_sitemap: { issues: [] },
      }],
    })
    expect(out).toContain('"含 "" 雙引號"')
  })
})
```

- [ ] **Step 2：確認失敗**

```bash
npx vitest run tests/server/utils/export/csv.test.ts
```

Expected: FAIL

- [ ] **Step 3：實作 `server/utils/export/csv.ts`**

```ts
// server/utils/export/csv.ts
interface CsvInput {
  domain: string
  analyzedAt: string
  siteIndexing: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engine: string | null
  }
  analyses: any[]
}

function escape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function totalIssues(a: any): number {
  return (a.meta_tags?.issues?.length || 0)
    + (a.core_web_vitals?.issues?.length || 0)
    + (a.robots_sitemap?.issues?.length || 0)
    + (a.schema_data?.issues?.length || 0)
    + (a.headings?.issues?.length || 0)
    + (a.images?.issues?.length || 0)
    + (a.indexing?.issues?.length || 0)
}

export function buildCsv(input: CsvInput): string {
  const BOM = '\uFEFF'
  const lines: string[] = []

  lines.push(`# 網域：${input.domain}`)
  lines.push(`# 分析時間：${input.analyzedAt}`)
  const si = input.siteIndexing
  const siText = si.pagesIndexed === null
    ? '索引查詢失敗'
    : `${si.pagesIndexed.toLocaleString('en-US')} 頁 / ${si.imagesIndexed?.toLocaleString('en-US')} 圖（${si.engine}）`
  lines.push(`# 整站收錄：${siText}`)

  lines.push([
    'URL', 'Title', 'Description', 'H1數量', 'CWV總分',
    'LCP(ms)', 'CLS', 'TBT(ms)', '索引狀態', 'Schema類型', '圖片缺alt數', '問題總數',
  ].join(','))

  for (const a of input.analyses) {
    lines.push([
      escape(a.url),
      escape(a.meta_tags?.title),
      escape(a.meta_tags?.description),
      escape(a.headings?.h1?.length ?? 0),
      escape(a.core_web_vitals?.speedScore),
      escape(a.core_web_vitals?.lcp),
      escape(a.core_web_vitals?.cls),
      escape(a.core_web_vitals?.tbt),
      escape(a.indexing?.isIndexed ? '已收錄' : '未收錄'),
      escape((a.schema_data?.types || []).join('|')),
      escape(a.images?.missingAlt ?? 0),
      escape(totalIssues(a)),
    ].join(','))
  }

  return BOM + lines.join('\n')
}
```

- [ ] **Step 4：跑測試**

```bash
npx vitest run tests/server/utils/export/csv.test.ts
```

Expected: PASS（4 個測試）

- [ ] **Step 5：Commit**

```bash
git add server/utils/export/csv.ts tests/server/utils/export/csv.test.ts
git commit -m "feat(export): add CSV builder"
```

---

## Task F2：Markdown 匯出 util

**Files:**
- Create: `server/utils/export/markdown.ts`
- Create: `tests/server/utils/export/markdown.test.ts`

- [ ] **Step 1：寫失敗測試 `tests/server/utils/export/markdown.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildMarkdown } from '../../../../server/utils/export/markdown'

describe('buildMarkdown', () => {
  const input = {
    domain: 'example.com',
    analyzedAt: '2026-04-14 10:32',
    pageCount: 2,
    siteIndexing: { pagesIndexed: 1250, imagesIndexed: 45, engine: 'serpapi' },
    aiReport: '## 整體摘要\n這個站表現不錯。',
    analyses: [
      {
        url: 'https://example.com/',
        meta_tags: { title: '首頁', issues: ['缺少 description'] },
        core_web_vitals: { speedScore: 85, issues: [] },
        headings: { h1: ['首頁'], issues: [] },
        indexing: { isIndexed: true, issues: [] },
        schema_data: { types: ['Article'], issues: [] },
        images: { missingAlt: 0, issues: [] },
        robots_sitemap: { issues: [] },
      },
      {
        url: 'https://example.com/blog',
        meta_tags: { title: '部落格', issues: [] },
        core_web_vitals: { speedScore: 72, issues: ['LCP > 4s'] },
        headings: { h1: [], issues: ['缺少 H1'] },
        indexing: { isIndexed: true, issues: [] },
        schema_data: { types: [], issues: [] },
        images: { missingAlt: 3, issues: ['3 張圖片缺 alt'] },
        robots_sitemap: { issues: [] },
      },
    ],
  }

  it('輸出包含網域與分析時間', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('# SEO 分析報告：example.com')
    expect(out).toContain('分析時間：2026-04-14 10:32')
  })

  it('包含整站收錄表格', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('| 網頁收錄 | 1,250 |')
    expect(out).toContain('| 圖片收錄 | 45 |')
  })

  it('嵌入 AI 報告原文', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('這個站表現不錯')
  })

  it('列出每頁問題', () => {
    const out = buildMarkdown(input)
    expect(out).toContain('https://example.com/blog')
    expect(out).toContain('3 張圖片缺 alt')
    expect(out).toContain('缺少 H1')
  })
})
```

- [ ] **Step 2：確認失敗**

```bash
npx vitest run tests/server/utils/export/markdown.test.ts
```

Expected: FAIL

- [ ] **Step 3：實作 `server/utils/export/markdown.ts`**

```ts
// server/utils/export/markdown.ts
interface MdInput {
  domain: string
  analyzedAt: string
  pageCount: number
  siteIndexing: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engine: string | null
  }
  aiReport: string | null
  analyses: any[]
}

function allIssues(a: any): string[] {
  return [
    ...(a.meta_tags?.issues || []),
    ...(a.core_web_vitals?.issues || []),
    ...(a.robots_sitemap?.issues || []),
    ...(a.schema_data?.issues || []),
    ...(a.headings?.issues || []),
    ...(a.images?.issues || []),
    ...(a.indexing?.issues || []),
  ]
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-US')
}

export function buildMarkdown(input: MdInput): string {
  const parts: string[] = []

  parts.push(`# SEO 分析報告：${input.domain}`)
  parts.push('')
  parts.push(`> 分析時間：${input.analyzedAt}  `)
  parts.push(`> 分析頁數：${input.pageCount} 頁`)
  parts.push('')

  parts.push('## 整站 Google 收錄')
  parts.push('')
  parts.push('| 項目 | 數量 |')
  parts.push('|------|------|')
  parts.push(`| 網頁收錄 | ${fmt(input.siteIndexing.pagesIndexed)} |`)
  parts.push(`| 圖片收錄 | ${fmt(input.siteIndexing.imagesIndexed)} |`)
  parts.push(`| 查詢引擎 | ${input.siteIndexing.engine || '—'} |`)
  parts.push('')

  if (input.aiReport) {
    parts.push('## AI 健診摘要')
    parts.push('')
    parts.push(input.aiReport)
    parts.push('')
  }

  parts.push('## 各頁指標摘要')
  parts.push('')
  parts.push('| URL | CWV 總分 | 索引 | 問題數 |')
  parts.push('|-----|---------|------|--------|')
  for (const a of input.analyses) {
    const issues = allIssues(a).length
    const indexed = a.indexing?.isIndexed ? '✅' : '❌'
    parts.push(`| ${a.url} | ${a.core_web_vitals?.speedScore ?? '—'} | ${indexed} | ${issues} |`)
  }
  parts.push('')

  parts.push('## 詳細問題清單')
  parts.push('')
  for (const a of input.analyses) {
    const issues = allIssues(a)
    if (issues.length === 0) continue
    parts.push(`### ${a.url}`)
    for (const issue of issues) parts.push(`- ⚠️ ${issue}`)
    parts.push('')
  }

  return parts.join('\n')
}
```

- [ ] **Step 4：跑測試**

```bash
npx vitest run tests/server/utils/export/markdown.test.ts
```

Expected: PASS（4 個測試）

- [ ] **Step 5：Commit**

```bash
git add server/utils/export/markdown.ts tests/server/utils/export/markdown.test.ts
git commit -m "feat(export): add Markdown builder"
```

---

## Task F3：匯出 API 路由

**Files:**
- Create: `server/api/export/[sessionId].get.ts`

- [ ] **Step 1：建立 `server/api/export/[sessionId].get.ts`**

```ts
// server/api/export/[sessionId].get.ts
import { buildCsv } from '../../utils/export/csv'
import { buildMarkdown } from '../../utils/export/markdown'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')
  const format = getQuery(event).format as string | undefined

  if (!sessionId) throw createError({ statusCode: 400, message: '缺少 sessionId' })
  if (format !== 'csv' && format !== 'markdown') {
    throw createError({ statusCode: 400, message: 'format 必須為 csv 或 markdown' })
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const { data: session, error: sessErr } = await supabase
    .from('analysis_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)  // 避免他人 sessionId
    .single()

  if (sessErr || !session) throw createError({ statusCode: 404, message: '找不到該分析資料' })

  const { data: analyses } = await supabase
    .from('page_analyses')
    .select('*')
    .eq('session_id', sessionId)

  const shortId = String(sessionId).slice(0, 8)
  const dateStr = new Date(session.created_at).toISOString().slice(0, 10).replace(/-/g, '')
  const safeDomain = String(session.domain).replace(/[^a-z0-9.-]/gi, '_')
  const baseName = `${safeDomain}_${shortId}_${dateStr}`

  if (format === 'csv') {
    const body = buildCsv({
      domain: session.domain,
      analyzedAt: session.created_at,
      siteIndexing: {
        pagesIndexed: session.site_pages_indexed,
        imagesIndexed: session.site_images_indexed,
        engine: session.site_indexing_engine,
      },
      analyses: analyses || [],
    })
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${baseName}.csv"`)
    return body
  }

  // markdown
  const body = buildMarkdown({
    domain: session.domain,
    analyzedAt: new Date(session.created_at).toLocaleString('zh-TW', { hour12: false }),
    pageCount: session.page_count,
    siteIndexing: {
      pagesIndexed: session.site_pages_indexed,
      imagesIndexed: session.site_images_indexed,
      engine: session.site_indexing_engine,
    },
    aiReport: session.ai_report,
    analyses: analyses || [],
  })
  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${baseName}.md"`)
  return body
})
```

- [ ] **Step 2：瀏覽器手動測試**

```bash
npm run dev
```

1. 跑完一個分析後進入 result 頁
2. 點右上角「匯出 → 匯出 CSV」→ 下載檔案，用 Excel 打開確認中文正常、每頁一列
3. 點「匯出 Markdown」→ 下載檔案，用編輯器打開確認結構完整

- [ ] **Step 3：Commit**

```bash
git add server/api/export/\[sessionId\].get.ts
git commit -m "feat(api): add GET /api/export/[sessionId] for CSV/Markdown"
```

---

# Phase G：整合測試與清理

## Task G1：端到端手動測試清單

**Files:**
- （無檔案修改，僅驗證）

- [ ] **Step 1：全功能端到端測試**

```bash
npm run dev
```

手動逐項打勾：

- [ ] 登入後 dashboard 正常顯示剩餘額度
- [ ] 輸入一個有 sitemap 的網域 → 直接跳 running 頁
- [ ] running 頁：進度條動態更新、整站卡骨架 → 顯示數字、頁面從 ⏳ 變 ◌ 變 ✅
- [ ] 頁面全部完成後，AI 報告狀態顯示「已完成」，3 秒內自動跳 result 頁
- [ ] result 頁：頂部整站收錄卡顯示正確數字，AI 報告可讀
- [ ] result 頁：點「重新查詢」→ 整站數字會重新載入（可能命中快取，但日期時間會更新）
- [ ] result 頁：點「匯出 CSV」→ 下載成功，Excel 打開中文無亂碼
- [ ] result 頁：點「匯出 Markdown」→ 下載成功，內容含整站收錄、AI 報告、各頁摘要、問題清單
- [ ] history 頁每張卡片顯示「收錄：X 頁 / Y 圖」
- [ ] 輸入一個沒有 sitemap 也無內部連結的網域 → dashboard 顯示錯誤訊息，不扣額度
- [ ] 關閉所有三引擎金鑰 → 分析仍完成，但整站卡顯示「索引查詢服務暫時無法使用」
- [ ] 同一網域 24 小時內重複分析 → 第二次整站卡顯示「💾 使用快取」

- [ ] **Step 2：跑全部單元測試**

```bash
npx vitest run
```

Expected: 所有測試通過

- [ ] **Step 3：記錄遺留 bug（若有）**

如發現問題，在 `docs/superpowers/plans/2026-04-14-full-site-analysis.md` 底部追加「## 已知問題」區塊列出。

---

## Task G2：`PageAnalysisResult` 型別 `aiReport` 欄位調整

**Files:**
- Modify: `server/utils/analyzers/types.ts`

既有 `PageAnalysisResult.aiReport` 仍存在但不再寫入。為避免型別誤導，改為可選並標註。

- [ ] **Step 1：修改型別定義**

找到 `PageAnalysisResult` 介面，把 `aiReport` 改成：

```ts
export interface PageAnalysisResult {
  // ...（其他欄位保留）
  /** @deprecated 2026-04-14：AI 報告改為整站一份（存於 analysis_sessions.ai_report） */
  aiReport?: string | null
}
```

- [ ] **Step 2：Commit**

```bash
git add server/utils/analyzers/types.ts
git commit -m "refactor(types): mark PageAnalysisResult.aiReport as deprecated"
```

---

## Task G3：更新 README

**Files:**
- Modify: `README.md`

- [ ] **Step 1：在 README 的「使用限制」或「特色」區塊中更新：**

- 單次分析頁數上限：10 → 30（可調）
- 新增：整站 Google 收錄量查詢（含 24 小時快取）
- 新增：CSV / Markdown 匯出
- AI 報告：每頁一份 → 整站一份

- [ ] **Step 2：Commit**

```bash
git add README.md
git commit -m "docs: update README for full-site analysis feature set"
```

---

## 實作順序建議

1. **Phase A → B → C → D → E → F → G** 依序執行
2. 每個 Task 完成後立即 commit，不要累積多個 task 才 commit
3. Phase B（三引擎）與 Phase D（前端）彼此獨立，可由不同人/subagent 平行處理
4. Phase C 必須在 Phase B 完成後才開始（SSE 依賴引擎與快取）
5. Phase F（匯出）相對獨立，可在任何時候插入，但建議放最後（需 ai_report 欄位與整站數據齊全）

---

## 附註：Cloudflare Workers 部署驗證

開發完成部署到 Cloudflare Pages 後，特別驗證：

1. **SSE 串流是否正常運作**：瀏覽器 Network tab 查看 `/api/analyze/run` 回應為 `text/event-stream` 且資料陸續抵達
2. **30 頁是否超時**：實測 30 頁網域，確認在 30 秒 wall-clock 內完成（視外部 API 速度，若常超時需降至 25 頁或減少 PAGE_BATCH_CONCURRENCY）
3. **p-limit 於 Workers runtime 可用**：若遇問題可改用簡單的批次 for-of 迴圈

若 Workers 環境對 SSE 相容性有問題，退路方案：改回輪詢式進度（前端每 2 秒打 `status/[sessionId]`）—這在 Task D3 的 `pollStatus()` 已經實作好作為 fallback。
