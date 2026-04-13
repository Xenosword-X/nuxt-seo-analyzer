# nuxt-seo-analyzer — Phase 2: 分析引擎 + AI 報告

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 7 大 SEO 分析模組、三引擎降級索引檢查、GPT-4o-mini 中文報告產生、Session 管理與分析執行 API。完成後從 Discover 頁面點擊「開始分析」能實際跑完所有指標並存入 Supabase。

**Architecture:** 每個分析模組是一個獨立的 async 函式，接受 URL 回傳型別化結果。`run.post.ts` 建立 Session 後在背景以 `Promise.allSettled` 平行執行 7 個模組，逐頁完成後存 DB 並呼叫 GPT-4o-mini 產生中文報告。前端透過輪詢 `status/[sessionId]` 取得進度。

**Tech Stack:** Nuxt 3 Nitro、cheerio、fast-xml-parser、openai SDK、Supabase（已安裝）

---

## 重要架構慣例（必讀）

- `server/api/` 中的函式由 Nuxt **自動 import** `server/utils/`，**不寫 import 陳述式**
- `server/utils/` 檔案間互相引用用**相對路徑**（`./supabase`，不用 `~/`）
- tests 中 mock 路徑用**相對路徑**（從 `tests/` 到 `server/` 的相對路徑）
- Vitest alias `~` 已設定指向專案根目錄（`vitest.config.ts`）

---

## 檔案結構（本計畫將建立的檔案）

```
server/utils/
├── analyzers/
│   ├── types.ts          # 所有分析結果的 TypeScript 介面
│   ├── meta.ts           # Meta tags 分析器
│   ├── robots.ts         # Robots.txt + Sitemap 驗證
│   ├── schema.ts         # JSON-LD Schema 偵測
│   ├── headings.ts       # H1~H3 結構 + 內部連結計數
│   ├── images.ts         # 圖片 Alt 缺漏掃描
│   ├── indexing.ts       # 三引擎降級索引檢查
│   └── cwv.ts            # Core Web Vitals（PageSpeed API）
└── report.ts             # GPT-4o-mini 中文報告產生

server/api/analyze/
├── run.post.ts           # 建立 session + 背景執行分析
└── status/
    └── [sessionId].get.ts  # 輪詢分析進度

tests/server/utils/analyzers/
├── meta.test.ts
├── robots.test.ts
├── schema.test.ts
├── headings.test.ts
├── images.test.ts
├── indexing.test.ts
└── cwv.test.ts
```

---

## Task 1：共用型別定義

**Files:**
- Create: `server/utils/analyzers/types.ts`

- [ ] **Step 1：建立 `server/utils/analyzers/types.ts`**

```ts
// server/utils/analyzers/types.ts

export interface MetaTagsResult {
  title: string | null
  description: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  canonical: string | null
  robotsMeta: string | null
  score: number        // 0-100
  issues: string[]
}

export interface CWVResult {
  fcp: number | null   // First Contentful Paint (ms)
  lcp: number | null   // Largest Contentful Paint (ms)
  tbt: number | null   // Total Blocking Time (ms)
  cls: number | null   // Cumulative Layout Shift
  speedScore: number | null  // 0-100
  issues: string[]
}

export interface RobotsSitemapResult {
  robotsAllowed: boolean
  sitemapExists: boolean
  sitemapUrl: string | null
  issues: string[]
}

export interface SchemaResult {
  types: string[]      // e.g. ['Article', 'BreadcrumbList']
  count: number
  issues: string[]
}

export interface HeadingsResult {
  h1: string[]
  h2Count: number
  h3Count: number
  internalLinkCount: number
  issues: string[]
}

export interface ImagesResult {
  total: number
  missingAlt: number
  missingSrcs: string[]  // src of images without alt (max 10)
  issues: string[]
}

export interface IndexingResult {
  isIndexed: boolean
  resultCount: number | null
  engineUsed: 'serpapi' | 'apify' | 'scraperapi' | 'failed'
  issues: string[]
}

export interface PageAnalysisResult {
  url: string
  metaTags: MetaTagsResult
  coreWebVitals: CWVResult
  robotsSitemap: RobotsSitemapResult
  schemaData: SchemaResult
  headings: HeadingsResult
  images: ImagesResult
  indexing: IndexingResult
  aiReport: string
}
```

- [ ] **Step 2：Commit**

```bash
cd "C:/Users/User/Documents/GitHub/nuxt-seo-analyzer"
git add server/utils/analyzers/types.ts
git commit -m "feat: add shared analyzer types"
```

---

## Task 2：Meta Tags 分析器（TDD）

**Files:**
- Create: `server/utils/analyzers/meta.ts`
- Create: `tests/server/utils/analyzers/meta.test.ts`

- [ ] **Step 1：先寫 failing test**

建立 `tests/server/utils/analyzers/meta.test.ts`：

```ts
// tests/server/utils/analyzers/meta.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeMeta } from '~/server/utils/analyzers/meta'

const goodHtml = `<!DOCTYPE html>
<html>
<head>
  <title>完整的頁面標題 Good Title</title>
  <meta name="description" content="這是一個完整的 meta description，長度符合建議的 50-160 字元範圍，包含重要關鍵字。" />
  <meta property="og:title" content="OG Title" />
  <meta property="og:description" content="OG Description" />
  <meta property="og:image" content="https://example.com/image.jpg" />
  <link rel="canonical" href="https://example.com/page" />
</head>
<body></body>
</html>`

const badHtml = `<!DOCTYPE html>
<html>
<head>
  <title>短</title>
</head>
<body></body>
</html>`

describe('analyzeMeta', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('完整 meta tags：回傳高分且無問題', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(goodHtml),
    }))

    const result = await analyzeMeta('https://example.com/page')
    expect(result.title).toBe('完整的頁面標題 Good Title')
    expect(result.description).toContain('meta description')
    expect(result.ogTitle).toBe('OG Title')
    expect(result.ogImage).toBe('https://example.com/image.jpg')
    expect(result.canonical).toBe('https://example.com/page')
    expect(result.issues).toHaveLength(0)
    expect(result.score).toBeGreaterThanOrEqual(90)
  })

  it('缺少 description、og tags、canonical：回傳低分和問題清單', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(badHtml),
    }))

    const result = await analyzeMeta('https://example.com')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues.some(i => i.includes('description'))).toBe(true)
    expect(result.score).toBeLessThan(80)
  })

  it('頁面 404：回傳 score=0 和錯誤訊息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const result = await analyzeMeta('https://example.com')
    expect(result.score).toBe(0)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('fetch 失敗：回傳 score=0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    const result = await analyzeMeta('https://example.com')
    expect(result.score).toBe(0)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
cd "C:/Users/User/Documents/GitHub/nuxt-seo-analyzer"
npx vitest run tests/server/utils/analyzers/meta.test.ts 2>&1
```

Expected: FAIL（module not found）

- [ ] **Step 3：實作 `server/utils/analyzers/meta.ts`**

```ts
// server/utils/analyzers/meta.ts
import * as cheerio from 'cheerio'
import type { MetaTagsResult } from './types'

export async function analyzeMeta(url: string): Promise<MetaTagsResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return emptyMeta(['頁面無法訪問（HTTP ' + res.status + '）'])
    const html = await res.text()
    return parseMeta(html)
  } catch {
    return emptyMeta(['頁面載入失敗'])
  }
}

function parseMeta(html: string): MetaTagsResult {
  const $ = cheerio.load(html)

  const title = $('title').first().text().trim() || null
  const description = $('meta[name="description"]').attr('content') || null
  const ogTitle = $('meta[property="og:title"]').attr('content') || null
  const ogDescription = $('meta[property="og:description"]').attr('content') || null
  const ogImage = $('meta[property="og:image"]').attr('content') || null
  const canonical = $('link[rel="canonical"]').attr('href') || null
  const robotsMeta = $('meta[name="robots"]').attr('content') || null

  const issues: string[] = []
  let score = 100

  if (!title) {
    issues.push('缺少 <title> 標籤')
    score -= 25
  } else if (title.length < 10 || title.length > 60) {
    issues.push(`標題長度不佳（${title.length} 字元，建議 10-60）`)
    score -= 10
  }

  if (!description) {
    issues.push('缺少 meta description')
    score -= 20
  } else if (description.length < 50 || description.length > 160) {
    issues.push(`description 長度不佳（${description.length} 字元，建議 50-160）`)
    score -= 10
  }

  if (!canonical) { issues.push('缺少 canonical 標籤'); score -= 10 }
  if (!ogTitle) { issues.push('缺少 og:title'); score -= 5 }
  if (!ogDescription) { issues.push('缺少 og:description'); score -= 5 }
  if (!ogImage) { issues.push('缺少 og:image'); score -= 5 }

  return {
    title, description, ogTitle, ogDescription, ogImage,
    canonical, robotsMeta, score: Math.max(0, score), issues,
  }
}

function emptyMeta(issues: string[]): MetaTagsResult {
  return {
    title: null, description: null, ogTitle: null,
    ogDescription: null, ogImage: null, canonical: null,
    robotsMeta: null, score: 0, issues,
  }
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/analyzers/meta.test.ts 2>&1
```

Expected: 4 tests passed

- [ ] **Step 5：Commit**

```bash
git add server/utils/analyzers/meta.ts tests/server/utils/analyzers/meta.test.ts
git commit -m "feat: add meta tags analyzer with TDD"
```

---

## Task 3：Robots.txt + Sitemap 驗證器（TDD）

**Files:**
- Create: `server/utils/analyzers/robots.ts`
- Create: `tests/server/utils/analyzers/robots.test.ts`

- [ ] **Step 1：先寫 failing test**

```ts
// tests/server/utils/analyzers/robots.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeRobots } from '~/server/utils/analyzers/robots'

describe('analyzeRobots', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('robots.txt 允許且 sitemap 存在：無問題', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('User-agent: *\nAllow: /') })
      .mockResolvedValueOnce({ ok: true })
    )

    const result = await analyzeRobots('https://example.com/page')
    expect(result.robotsAllowed).toBe(true)
    expect(result.sitemapExists).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('robots.txt 封鎖路徑：回傳 robotsAllowed=false 和問題', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('User-agent: *\nDisallow: /page'),
      })
      .mockResolvedValueOnce({ ok: false })
    )

    const result = await analyzeRobots('https://example.com/page')
    expect(result.robotsAllowed).toBe(false)
    expect(result.issues.some(i => i.includes('robots'))).toBe(true)
  })

  it('robots.txt 不存在（404）：視為允許', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
    )

    const result = await analyzeRobots('https://example.com/page')
    expect(result.robotsAllowed).toBe(true)
    expect(result.sitemapExists).toBe(false)
  })

  it('sitemap 不存在：issues 包含 sitemap 警告', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') })
      .mockResolvedValueOnce({ ok: false })
    )

    const result = await analyzeRobots('https://example.com/')
    expect(result.sitemapExists).toBe(false)
    expect(result.issues.some(i => i.includes('sitemap'))).toBe(true)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/analyzers/robots.test.ts 2>&1
```

Expected: FAIL

- [ ] **Step 3：實作 `server/utils/analyzers/robots.ts`**

```ts
// server/utils/analyzers/robots.ts
import type { RobotsSitemapResult } from './types'

export async function analyzeRobots(url: string): Promise<RobotsSitemapResult> {
  const origin = new URL(url).origin
  const path = url.replace(origin, '') || '/'

  const [robotsAllowed, sitemapResult] = await Promise.all([
    checkRobots(origin, path),
    checkSitemap(origin),
  ])

  const issues: string[] = []
  if (!robotsAllowed) issues.push('robots.txt 封鎖此頁面，Googlebot 無法爬取')
  if (!sitemapResult.exists) issues.push('找不到 sitemap.xml，建議建立以助於索引')

  return {
    robotsAllowed,
    sitemapExists: sitemapResult.exists,
    sitemapUrl: sitemapResult.url,
    issues,
  }
}

async function checkRobots(origin: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return true
    const text = await res.text()
    return !isBlocked(text, path)
  } catch {
    return true
  }
}

function isBlocked(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split('\n').map(l => l.trim())
  let active = false
  const disallowed: string[] = []

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.startsWith('user-agent:')) {
      const agent = line.split(':')[1]?.trim().toLowerCase()
      active = agent === '*' || agent === 'googlebot'
    }
    if (active && lower.startsWith('disallow:')) {
      const d = line.split(':')[1]?.trim()
      if (d) disallowed.push(d)
    }
  }

  return disallowed.some(d => d !== '' && path.startsWith(d))
}

async function checkSitemap(origin: string): Promise<{ exists: boolean; url: string | null }> {
  const url = `${origin}/sitemap.xml`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    return { exists: res.ok, url: res.ok ? url : null }
  } catch {
    return { exists: false, url: null }
  }
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/analyzers/robots.test.ts 2>&1
```

Expected: 4 tests passed

- [ ] **Step 5：Commit**

```bash
git add server/utils/analyzers/robots.ts tests/server/utils/analyzers/robots.test.ts
git commit -m "feat: add robots.txt + sitemap validator with TDD"
```

---

## Task 4：JSON-LD Schema 偵測器（TDD）

**Files:**
- Create: `server/utils/analyzers/schema.ts`
- Create: `tests/server/utils/analyzers/schema.test.ts`

- [ ] **Step 1：先寫 failing test**

```ts
// tests/server/utils/analyzers/schema.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeSchema } from '~/server/utils/analyzers/schema'

describe('analyzeSchema', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('有 Article + BreadcrumbList JSON-LD：回傳正確 types', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Test"}</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>
    </head></html>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }))

    const result = await analyzeSchema('https://example.com')
    expect(result.types).toContain('Article')
    expect(result.types).toContain('BreadcrumbList')
    expect(result.count).toBe(2)
    expect(result.issues).toHaveLength(0)
  })

  it('無 JSON-LD：issues 包含警告', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><head></head></html>'),
    }))

    const result = await analyzeSchema('https://example.com')
    expect(result.count).toBe(0)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('JSON-LD @type 為陣列：全部回傳', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":["Product","Thing"]}</script>
    </head></html>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }))

    const result = await analyzeSchema('https://example.com')
    expect(result.types).toContain('Product')
    expect(result.types).toContain('Thing')
  })

  it('無效 JSON：忽略並繼續', async () => {
    const html = `<html><head>
      <script type="application/ld+json">INVALID JSON</script>
      <script type="application/ld+json">{"@type":"Article"}</script>
    </head></html>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }))

    const result = await analyzeSchema('https://example.com')
    expect(result.types).toContain('Article')
    expect(result.count).toBe(1)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/analyzers/schema.test.ts 2>&1
```

- [ ] **Step 3：實作 `server/utils/analyzers/schema.ts`**

```ts
// server/utils/analyzers/schema.ts
import * as cheerio from 'cheerio'
import type { SchemaResult } from './types'

export async function analyzeSchema(url: string): Promise<SchemaResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { types: [], count: 0, issues: ['頁面無法訪問'] }
    const html = await res.text()
    return parseSchema(html)
  } catch {
    return { types: [], count: 0, issues: ['頁面載入失敗'] }
  }
}

function parseSchema(html: string): SchemaResult {
  const $ = cheerio.load(html)
  const types: string[] = []

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '')
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type']) {
          const t = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
          types.push(...t.filter(Boolean))
        }
      }
    } catch {
      // 忽略無效 JSON
    }
  })

  const issues = types.length === 0 ? ['未偵測到結構化資料（JSON-LD），建議加入 Schema 標記'] : []
  return { types, count: types.length, issues }
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/analyzers/schema.test.ts 2>&1
```

Expected: 4 tests passed

- [ ] **Step 5：Commit**

```bash
git add server/utils/analyzers/schema.ts tests/server/utils/analyzers/schema.test.ts
git commit -m "feat: add json-ld schema detector with TDD"
```

---

## Task 5：Headings + 內部連結分析器（TDD）

**Files:**
- Create: `server/utils/analyzers/headings.ts`
- Create: `tests/server/utils/analyzers/headings.test.ts`

- [ ] **Step 1：先寫 failing test**

```ts
// tests/server/utils/analyzers/headings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeHeadings } from '~/server/utils/analyzers/headings'

const goodHtml = `<html><body>
  <h1>主標題</h1>
  <h2>章節一</h2>
  <h2>章節二</h2>
  <h3>小節</h3>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
  <a href="https://external.com">External</a>
</body></html>`

describe('analyzeHeadings', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('正常結構：H1 一個、H2 兩個、H3 一個、內部連結 2 個', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(goodHtml),
    }))

    const result = await analyzeHeadings('https://example.com/page')
    expect(result.h1).toEqual(['主標題'])
    expect(result.h2Count).toBe(2)
    expect(result.h3Count).toBe(1)
    expect(result.internalLinkCount).toBe(2)
    expect(result.issues).toHaveLength(0)
  })

  it('缺少 H1：issues 包含警告', async () => {
    const html = '<html><body><h2>Only H2</h2></body></html>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }))

    const result = await analyzeHeadings('https://example.com')
    expect(result.h1).toHaveLength(0)
    expect(result.issues.some(i => i.includes('H1'))).toBe(true)
  })

  it('多個 H1：issues 包含重複警告', async () => {
    const html = '<html><body><h1>H1 A</h1><h1>H1 B</h1></body></html>'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }))

    const result = await analyzeHeadings('https://example.com')
    expect(result.h1).toHaveLength(2)
    expect(result.issues.some(i => i.includes('重複'))).toBe(true)
  })

  it('fetch 失敗：回傳空結果', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
    const result = await analyzeHeadings('https://example.com')
    expect(result.h1).toHaveLength(0)
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/analyzers/headings.test.ts 2>&1
```

- [ ] **Step 3：實作 `server/utils/analyzers/headings.ts`**

```ts
// server/utils/analyzers/headings.ts
import * as cheerio from 'cheerio'
import type { HeadingsResult } from './types'

export async function analyzeHeadings(url: string): Promise<HeadingsResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return emptyHeadings(['頁面無法訪問'])
    const html = await res.text()
    return parseHeadings(html, url)
  } catch {
    return emptyHeadings(['頁面載入失敗'])
  }
}

function parseHeadings(html: string, url: string): HeadingsResult {
  const $ = cheerio.load(html)
  const origin = new URL(url).origin

  const h1 = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const h2Count = $('h2').length
  const h3Count = $('h3').length

  let internalLinkCount = 0
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    try {
      const abs = new URL(href, url).href
      if (abs.startsWith(origin)) internalLinkCount++
    } catch { }
  })

  const issues: string[] = []
  if (h1.length === 0) issues.push('缺少 H1 標題，建議加入主要關鍵字')
  else if (h1.length > 1) issues.push(`H1 標題重複（共 ${h1.length} 個，建議只有 1 個）`)
  if (h2Count === 0) issues.push('缺少 H2 標題，內容層次不清')

  return { h1, h2Count, h3Count, internalLinkCount, issues }
}

function emptyHeadings(issues: string[]): HeadingsResult {
  return { h1: [], h2Count: 0, h3Count: 0, internalLinkCount: 0, issues }
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/analyzers/headings.test.ts 2>&1
```

Expected: 4 tests passed

- [ ] **Step 5：Commit**

```bash
git add server/utils/analyzers/headings.ts tests/server/utils/analyzers/headings.test.ts
git commit -m "feat: add headings + internal links analyzer with TDD"
```

---

## Task 6：圖片 Alt 缺漏掃描器（TDD）

**Files:**
- Create: `server/utils/analyzers/images.ts`
- Create: `tests/server/utils/analyzers/images.test.ts`

- [ ] **Step 1：先寫 failing test**

```ts
// tests/server/utils/analyzers/images.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeImages } from '~/server/utils/analyzers/images'

describe('analyzeImages', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('所有圖片都有 alt：missingAlt=0，issues 為空', async () => {
    const html = `<html><body>
      <img src="/a.jpg" alt="圖片A" />
      <img src="/b.jpg" alt="圖片B" />
    </body></html>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }))

    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(2)
    expect(result.missingAlt).toBe(0)
    expect(result.missingSrcs).toHaveLength(0)
    expect(result.issues).toHaveLength(0)
  })

  it('有圖片缺少 alt：正確計算並列出 src', async () => {
    const html = `<html><body>
      <img src="/a.jpg" alt="有" />
      <img src="/b.jpg" />
      <img src="/c.jpg" alt="" />
    </body></html>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    }))

    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(3)
    expect(result.missingAlt).toBe(2)
    expect(result.missingSrcs).toContain('/b.jpg')
    expect(result.missingSrcs).toContain('/c.jpg')
    expect(result.issues.some(i => i.includes('alt'))).toBe(true)
  })

  it('無圖片：total=0，issues 為空', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body><p>純文字</p></body></html>'),
    }))

    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(0)
    expect(result.missingAlt).toBe(0)
    expect(result.issues).toHaveLength(0)
  })

  it('missingSrcs 上限為 10 筆', async () => {
    const imgs = Array.from({ length: 15 }, (_, i) => `<img src="/img-${i}.jpg" />`).join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`<html><body>${imgs}</body></html>`),
    }))

    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(15)
    expect(result.missingAlt).toBe(15)
    expect(result.missingSrcs.length).toBeLessThanOrEqual(10)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/analyzers/images.test.ts 2>&1
```

- [ ] **Step 3：實作 `server/utils/analyzers/images.ts`**

```ts
// server/utils/analyzers/images.ts
import * as cheerio from 'cheerio'
import type { ImagesResult } from './types'

export async function analyzeImages(url: string): Promise<ImagesResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { total: 0, missingAlt: 0, missingSrcs: [], issues: ['頁面無法訪問'] }
    const html = await res.text()
    return parseImages(html)
  } catch {
    return { total: 0, missingAlt: 0, missingSrcs: [], issues: ['頁面載入失敗'] }
  }
}

function parseImages(html: string): ImagesResult {
  const $ = cheerio.load(html)
  const imgs = $('img').toArray()
  const total = imgs.length
  const missingSrcs: string[] = []

  imgs.forEach(el => {
    const alt = $(el).attr('alt')
    if (alt === undefined || alt === null || alt.trim() === '') {
      missingSrcs.push($(el).attr('src') ?? '')
    }
  })

  const missingAlt = missingSrcs.length
  const issues = missingAlt > 0
    ? [`${missingAlt} 張圖片缺少 alt 屬性，影響無障礙性與 SEO`]
    : []

  return { total, missingAlt, missingSrcs: missingSrcs.slice(0, 10), issues }
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/analyzers/images.test.ts 2>&1
```

Expected: 4 tests passed

- [ ] **Step 5：Commit**

```bash
git add server/utils/analyzers/images.ts tests/server/utils/analyzers/images.test.ts
git commit -m "feat: add image alt text scanner with TDD"
```

---

## Task 7：三引擎降級索引檢查器（TDD）

**Files:**
- Create: `server/utils/analyzers/indexing.ts`
- Create: `tests/server/utils/analyzers/indexing.test.ts`

- [ ] **Step 1：先寫 failing test**

```ts
// tests/server/utils/analyzers/indexing.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeIndexing } from '~/server/utils/analyzers/indexing'

// mock useRuntimeConfig（Nuxt auto-import）
vi.stubGlobal('useRuntimeConfig', () => ({
  serpApiKeys: '["serpkey1"]',
  apifyKeys: '["apifykey1"]',
  scraperApiKeys: '["scraperkey1"]',
}))

describe('analyzeIndexing', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('SerpApi 成功回傳有索引結果：engineUsed=serpapi，isIndexed=true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        search_information: { total_results: '1,230' },
      }),
    }))

    const result = await analyzeIndexing('https://example.com/page')
    expect(result.engineUsed).toBe('serpapi')
    expect(result.isIndexed).toBe(true)
    expect(result.resultCount).toBeGreaterThan(0)
    expect(result.issues).toHaveLength(0)
  })

  it('SerpApi 回傳 0 結果：isIndexed=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ search_information: { total_results: '0' } }),
    }))

    const result = await analyzeIndexing('https://example.com/page')
    expect(result.isIndexed).toBe(false)
    expect(result.issues.some(i => i.includes('索引'))).toBe(true)
  })

  it('SerpApi 失敗（error 欄位）→ 降級到 Apify', async () => {
    vi.stubGlobal('fetch', vi.fn()
      // SerpApi: 有 error
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ error: 'Your account credit limit is reached' }),
      })
      // Apify: 成功
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ resultsTotal: 500 }]),
      })
    )

    const result = await analyzeIndexing('https://example.com/page')
    expect(result.engineUsed).toBe('apify')
    expect(result.isIndexed).toBe(true)
  })

  it('所有引擎都失敗：engineUsed=failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    const result = await analyzeIndexing('https://example.com/page')
    expect(result.engineUsed).toBe('failed')
    expect(result.issues.some(i => i.includes('失敗'))).toBe(true)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/analyzers/indexing.test.ts 2>&1
```

- [ ] **Step 3：實作 `server/utils/analyzers/indexing.ts`**

```ts
// server/utils/analyzers/indexing.ts
import type { IndexingResult } from './types'

interface CheckResult {
  isIndexed: boolean
  resultCount: number
}

export async function analyzeIndexing(url: string): Promise<IndexingResult> {
  const config = useRuntimeConfig()
  const domain = new URL(url).hostname

  const serpKeys: string[] = JSON.parse(config.serpApiKeys || '[]')
  const apifyKeys: string[] = JSON.parse(config.apifyKeys || '[]')
  const scraperKeys: string[] = JSON.parse(config.scraperApiKeys || '[]')

  // 1. SerpApi
  if (serpKeys.length > 0) {
    const r = await checkViaSerpApi(domain, serpKeys)
    if (r) return toResult(r, 'serpapi')
  }

  // 2. Apify
  if (apifyKeys.length > 0) {
    const r = await checkViaApify(domain, apifyKeys)
    if (r) return toResult(r, 'apify')
  }

  // 3. ScraperAPI
  if (scraperKeys.length > 0) {
    const r = await checkViaScraperApi(domain, scraperKeys)
    if (r) return toResult(r, 'scraperapi')
  }

  return {
    isIndexed: false,
    resultCount: null,
    engineUsed: 'failed',
    issues: ['所有索引檢查引擎均失敗，請檢查 API 金鑰設定'],
  }
}

function toResult(r: CheckResult, engine: IndexingResult['engineUsed']): IndexingResult {
  return {
    isIndexed: r.isIndexed,
    resultCount: r.resultCount,
    engineUsed: engine,
    issues: r.isIndexed ? [] : ['頁面未被 Google 索引，建議提交至 Google Search Console'],
  }
}

async function checkViaSerpApi(domain: string, keys: string[]): Promise<CheckResult | null> {
  for (const key of keys) {
    try {
      const query = encodeURIComponent(`site:${domain}`)
      const res = await fetch(
        `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${key}&num=1`,
        { signal: AbortSignal.timeout(15_000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      if (data.error) continue  // 額度耗盡，換下一組 key
      const count = Number(String(data.search_information?.total_results ?? '0').replace(/,/g, ''))
      return { isIndexed: count > 0, resultCount: count }
    } catch { continue }
  }
  return null
}

async function checkViaApify(domain: string, keys: string[]): Promise<CheckResult | null> {
  for (const key of keys) {
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queries: `site:${domain}`,
            resultsPerPage: 1,
            maxPagesPerQuery: 1,
          }),
          signal: AbortSignal.timeout(60_000),
        }
      )
      if (!res.ok) continue
      const data = await res.json()
      const count = data?.[0]?.resultsTotal ?? 0
      return { isIndexed: count > 0, resultCount: count }
    } catch { continue }
  }
  return null
}

async function checkViaScraperApi(domain: string, keys: string[]): Promise<CheckResult | null> {
  for (const key of keys) {
    try {
      const query = encodeURIComponent(`site:${domain}`)
      const targetUrl = encodeURIComponent(`https://www.google.com/search?q=${query}&num=1&hl=zh-TW`)
      const res = await fetch(
        `http://api.scraperapi.com/?api_key=${key}&url=${targetUrl}`,
        { signal: AbortSignal.timeout(30_000) }
      )
      if (!res.ok) continue
      const html = await res.text()
      const match = html.match(/約有\s*([\d,]+)\s*項/) || html.match(/([\d,]+)\s*results/)
      const count = match ? parseInt(match[1].replace(/,/g, '')) : 0
      return { isIndexed: count > 0, resultCount: count }
    } catch { continue }
  }
  return null
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/analyzers/indexing.test.ts 2>&1
```

Expected: 4 tests passed。若有問題分析並調整。

- [ ] **Step 5：Commit**

```bash
git add server/utils/analyzers/indexing.ts tests/server/utils/analyzers/indexing.test.ts
git commit -m "feat: add three-engine indexing checker with TDD"
```

---

## Task 8：Core Web Vitals 分析器（TDD with mock）

**Files:**
- Create: `server/utils/analyzers/cwv.ts`
- Create: `tests/server/utils/analyzers/cwv.test.ts`

- [ ] **Step 1：先寫 failing test**

```ts
// tests/server/utils/analyzers/cwv.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeCWV } from '~/server/utils/analyzers/cwv'

vi.stubGlobal('useRuntimeConfig', () => ({ pagespeedApiKey: 'test-key' }))

const mockPagespeedResponse = {
  lighthouseResult: {
    categories: { performance: { score: 0.72 } },
    audits: {
      'first-contentful-paint': { numericValue: 1800 },
      'largest-contentful-paint': { numericValue: 2100 },
      'total-blocking-time': { numericValue: 150 },
      'cumulative-layout-shift': { numericValue: 0.05 },
    },
  },
}

describe('analyzeCWV', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('PageSpeed API 成功：正確解析各指標', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPagespeedResponse),
    }))

    const result = await analyzeCWV('https://example.com')
    expect(result.speedScore).toBe(72)
    expect(result.fcp).toBe(1800)
    expect(result.lcp).toBe(2100)
    expect(result.tbt).toBe(150)
    expect(result.cls).toBe(0.05)
    expect(result.issues).toHaveLength(0)
  })

  it('speedScore < 50：issues 包含效能警告', async () => {
    const lowScore = {
      ...mockPagespeedResponse,
      lighthouseResult: {
        ...mockPagespeedResponse.lighthouseResult,
        categories: { performance: { score: 0.35 } },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(lowScore),
    }))

    const result = await analyzeCWV('https://example.com')
    expect(result.speedScore).toBe(35)
    expect(result.issues.some(i => i.includes('效能'))).toBe(true)
  })

  it('LCP > 2500ms：issues 包含 LCP 警告', async () => {
    const slowLcp = {
      lighthouseResult: {
        categories: { performance: { score: 0.6 } },
        audits: {
          'first-contentful-paint': { numericValue: 1000 },
          'largest-contentful-paint': { numericValue: 4000 },
          'total-blocking-time': { numericValue: 100 },
          'cumulative-layout-shift': { numericValue: 0.02 },
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(slowLcp),
    }))

    const result = await analyzeCWV('https://example.com')
    expect(result.issues.some(i => i.includes('LCP'))).toBe(true)
  })

  it('API 請求失敗：所有指標為 null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    const result = await analyzeCWV('https://example.com')
    expect(result.speedScore).toBeNull()
    expect(result.fcp).toBeNull()
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/analyzers/cwv.test.ts 2>&1
```

- [ ] **Step 3：實作 `server/utils/analyzers/cwv.ts`**

```ts
// server/utils/analyzers/cwv.ts
import type { CWVResult } from './types'

export async function analyzeCWV(url: string): Promise<CWVResult> {
  const config = useRuntimeConfig()
  const apiKey = config.pagespeedApiKey as string

  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(30_000) })

    if (!res.ok) return empty(['PageSpeed API 請求失敗（HTTP ' + res.status + '）'])

    const data = await res.json()
    const audits = data?.lighthouseResult?.audits
    const categories = data?.lighthouseResult?.categories

    const fcp = audits?.['first-contentful-paint']?.numericValue ?? null
    const lcp = audits?.['largest-contentful-paint']?.numericValue ?? null
    const tbt = audits?.['total-blocking-time']?.numericValue ?? null
    const cls = audits?.['cumulative-layout-shift']?.numericValue ?? null
    const speedScore = categories?.performance?.score != null
      ? Math.round(categories.performance.score * 100)
      : null

    const issues: string[] = []
    if (speedScore !== null && speedScore < 50) issues.push(`效能分數偏低（${speedScore}/100，建議 > 50）`)
    if (lcp !== null && lcp > 2500) issues.push(`LCP 過慢（${Math.round(lcp)}ms，建議 < 2500ms）`)
    if (cls !== null && cls > 0.1) issues.push(`CLS 過高（${cls.toFixed(3)}，建議 < 0.1）`)

    return { fcp, lcp, tbt, cls, speedScore, issues }
  } catch {
    return empty(['PageSpeed API 請求失敗'])
  }
}

function empty(issues: string[]): CWVResult {
  return { fcp: null, lcp: null, tbt: null, cls: null, speedScore: null, issues }
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/analyzers/cwv.test.ts 2>&1
```

Expected: 4 tests passed

- [ ] **Step 5：執行所有 tests 確認無回歸**

```bash
npx vitest run 2>&1
```

Expected: 全部通過（14 舊 + 20 新 = 34 tests）

- [ ] **Step 6：Commit**

```bash
git add server/utils/analyzers/cwv.ts tests/server/utils/analyzers/cwv.test.ts
git commit -m "feat: add core web vitals analyzer (pagespeed api) with TDD"
```

---

## Task 9：AI 報告產生器（GPT-4o-mini）

**Files:**
- Create: `server/utils/report.ts`

- [ ] **Step 1：實作 `server/utils/report.ts`**

此模組直接呼叫 OpenAI API，不寫單元測試（外部服務，需真實 key 才有意義）。

```ts
// server/utils/report.ts
import OpenAI from 'openai'
import type { PageAnalysisResult } from './analyzers/types'

export async function generateAIReport(analysis: Omit<PageAnalysisResult, 'aiReport'>): Promise<string> {
  const config = useRuntimeConfig()
  const client = new OpenAI({ apiKey: config.openaiApiKey as string })

  // 整理問題清單，避免傳送過多資料
  const summary = {
    url: analysis.url,
    metaScore: analysis.metaTags.score,
    metaIssues: analysis.metaTags.issues,
    speedScore: analysis.coreWebVitals.speedScore,
    cwvIssues: analysis.coreWebVitals.issues,
    robotsIssues: analysis.robotsSitemap.issues,
    schemaTypes: analysis.schemaData.types,
    schemaIssues: analysis.schemaData.issues,
    headingIssues: analysis.headings.issues,
    h1Count: analysis.headings.h1.length,
    imageIssues: analysis.images.issues,
    missingAltCount: analysis.images.missingAlt,
    isIndexed: analysis.indexing.isIndexed,
    indexingIssues: analysis.indexing.issues,
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `你是一位專業的 SEO 顧問。請根據提供的頁面分析資料，用繁體中文撰寫一份簡潔的 SEO 健診報告。

報告格式（Markdown）：
## 整體評估
（1-2 句話概述）

## 主要問題
- 問題一
- 問題二
（最多 5 點，依嚴重程度排序）

## 優先改善建議
1. 建議一（具體可執行）
2. 建議二
（最多 3 點）

語氣：專業但易懂，避免過多行話。若某項指標正常，可略過不提。`,
        },
        {
          role: 'user',
          content: JSON.stringify(summary, null, 2),
        },
      ],
    })

    return response.choices[0]?.message?.content ?? '報告產生失敗'
  } catch (e) {
    console.error('AI report generation failed:', e)
    return '報告產生失敗（請確認 OpenAI API Key 是否正確設定）'
  }
}
```

- [ ] **Step 2：Commit**

```bash
git add server/utils/report.ts
git commit -m "feat: add gpt-4o-mini chinese seo report generator"
```

---

## Task 10：Session 管理 + 分析執行 API

**Files:**
- Create: `server/api/analyze/run.post.ts`

- [ ] **Step 1：實作 `server/api/analyze/run.post.ts`**

```ts
// server/api/analyze/run.post.ts
// Nuxt auto-imports: useServerSupabase, generateAIReport,
//   analyzeMeta, analyzeCWV, analyzeRobots, analyzeSchema,
//   analyzeHeadings, analyzeImages, analyzeIndexing
import type {
  PageAnalysisResult,
  MetaTagsResult,
  CWVResult,
  RobotsSitemapResult,
  SchemaResult,
  HeadingsResult,
  ImagesResult,
  IndexingResult,
} from '../../utils/analyzers/types'
// 路徑說明：server/api/analyze/ → ../../ → server/ → utils/analyzers/types

interface RunBody {
  domain: string
  urls: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RunBody>(event)

  if (!body?.urls?.length) throw createError({ statusCode: 400, message: '請提供要分析的 URL 清單' })
  if (body.urls.length > 10) throw createError({ statusCode: 400, message: '最多 10 個 URL' })
  if (!body.domain) throw createError({ statusCode: 400, message: '請提供網域名稱' })

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  // 建立 session
  const { data: session, error: sessionError } = await supabase
    .from('analysis_sessions')
    .insert({
      user_id: user.id,
      domain: body.domain,
      status: 'running',
      page_count: body.urls.length,
    })
    .select()
    .single()

  if (sessionError || !session) {
    throw createError({ statusCode: 500, message: '建立分析工作階段失敗' })
  }

  // 在背景執行分析（不 await，立即回傳 sessionId）
  runAnalysisInBackground(session.id, body.urls).catch(console.error)

  return { sessionId: session.id, status: 'running', pageCount: body.urls.length }
})

async function runAnalysisInBackground(sessionId: string, urls: string[]) {
  const supabase = useServerSupabase()

  try {
    for (const url of urls) {
      // 平行執行 7 個分析器
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

      const analysisData: Omit<PageAnalysisResult, 'aiReport'> = {
        url,
        metaTags,
        coreWebVitals,
        robotsSitemap,
        schemaData,
        headings: headingsResult,
        images: imagesResult,
        indexing: indexingResult,
      }

      // 產生 AI 中文報告
      const aiReport = await generateAIReport(analysisData)

      // 存入 Supabase
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
        ai_report: aiReport,
      })
    }

    // 更新 session 狀態為完成
    await supabase
      .from('analysis_sessions')
      .update({ status: 'done' })
      .eq('id', sessionId)
  } catch (e) {
    console.error('Analysis failed:', e)
    await supabase
      .from('analysis_sessions')
      .update({ status: 'error' })
      .eq('id', sessionId)
  }
}
```

- [ ] **Step 2：Commit**

```bash
git add server/api/analyze/run.post.ts
git commit -m "feat: add analysis session manager and background run orchestrator"
```

---

## Task 11：分析進度狀態 API

**Files:**
- Create: `server/api/analyze/status/[sessionId].get.ts`

- [ ] **Step 1：實作**

```ts
// server/api/analyze/status/[sessionId].get.ts
export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')
  if (!sessionId) throw createError({ statusCode: 400, message: '缺少 sessionId' })

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  // 確認 session 屬於此用戶
  const { data: session } = await supabase
    .from('analysis_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) throw createError({ statusCode: 404, message: '找不到分析工作階段' })

  // 取得已完成的頁面分析
  const { data: analyses } = await supabase
    .from('page_analyses')
    .select('*')
    .eq('session_id', sessionId)
    .order('analyzed_at', { ascending: true })

  return {
    status: session.status,
    domain: session.domain,
    progress: {
      completed: (analyses ?? []).length,
      total: session.page_count,
    },
    analyses: analyses ?? [],
  }
})
```

- [ ] **Step 2：執行所有 tests 確認無回歸**

```bash
npx vitest run 2>&1
```

Expected: 34 tests passed（14 舊 + 20 新）

- [ ] **Step 3：更新 `app/pages/analyze/discover.vue` 中的 `startAnalysis` 函式**

讀取 `app/pages/analyze/discover.vue`，找到 `startAnalysis` 函式，改為：

```ts
async function startAnalysis() {
  if (selected.value.size === 0) return

  const supabase = useSupabaseClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return

  loading.value = true
  try {
    const result = await $fetch<{ sessionId: string }>('/api/analyze/run', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        domain: discoverData.value?.domain,
        urls: [...selected.value],
      },
    })
    await navigateTo(`/analyze/running?sessionId=${result.sessionId}`)
  } catch (e: any) {
    alert(e?.data?.message ?? '分析啟動失敗')
  } finally {
    loading.value = false
  }
}
```

同時在 `<script setup>` 頂部加入：
```ts
const loading = ref(false)
```

並在按鈕上加 `:loading="loading"` 屬性。

- [ ] **Step 4：建立過渡頁 `app/pages/analyze/running.vue`**

```vue
<!-- app/pages/analyze/running.vue -->
<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-2xl mx-auto space-y-6">

      <header class="flex items-center gap-4">
        <h1 class="text-xl font-bold text-gray-900">分析進行中...</h1>
      </header>

      <UCard>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-gray-700 font-medium">{{ domain }}</span>
            <span class="text-sm text-gray-500">{{ completed }} / {{ total }} 頁完成</span>
          </div>

          <UProgress :value="progressPercent" />

          <div v-if="status === 'done'" class="text-center pt-4">
            <p class="text-green-600 font-medium mb-4">分析完成！</p>
            <UButton @click="navigateTo(`/analyze/result/${sessionId}`)">
              查看報告
            </UButton>
          </div>

          <div v-else-if="status === 'error'" class="text-center pt-4">
            <p class="text-red-500">分析過程中發生錯誤</p>
          </div>

          <div v-else class="text-sm text-gray-400 text-center">
            正在分析頁面，請稍候...
          </div>
        </div>
      </UCard>

    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const sessionId = route.query.sessionId as string

const status = ref<string>('running')
const completed = ref(0)
const total = ref(0)
const domain = ref('')

const progressPercent = computed(() =>
  total.value > 0 ? Math.round((completed.value / total.value) * 100) : 0
)

const supabase = useSupabaseClient()

async function poll() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return

  try {
    const result = await $fetch<any>(`/api/analyze/status/${sessionId}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    status.value = result.status
    completed.value = result.progress.completed
    total.value = result.progress.total
    domain.value = result.domain
  } catch {}
}

let timer: ReturnType<typeof setInterval>

onMounted(() => {
  poll()
  timer = setInterval(async () => {
    await poll()
    if (status.value === 'done' || status.value === 'error') {
      clearInterval(timer)
    }
  }, 3000)
})

onUnmounted(() => clearInterval(timer))
</script>
```

- [ ] **Step 5：Commit**

```bash
git add server/api/analyze/status/ app/pages/analyze/running.vue app/pages/analyze/discover.vue
git commit -m "feat: add status api, running page, wire up start analysis flow"
```

---

## 完成確認清單

Phase 2 完成後，以下流程應可端對端運作：

- [ ] `npx vitest run` — 34 tests 全數通過
- [ ] 從 Discover 頁面勾選頁面 → 點「開始分析」→ 跳轉到 Running 頁面
- [ ] Running 頁面每 3 秒輪詢進度，進度條正確更新
- [ ] 分析完成後按鈕出現「查看報告」（Phase 3 實作報告頁面）
- [ ] Supabase Dashboard → Table Editor → `page_analyses` 確認有資料寫入
- [ ] `ai_report` 欄位有中文文字內容

---

## 下一步：Phase 3

**Plan 3** 將實作：
- 完整報告頁面 `analyze/result/[sessionId].vue`（左側頁面列表 + 右側指標詳情 + AI 報告）
- 歷史紀錄頁面 `history/index.vue`
- 兩次分析比較功能
