# nuxt-seo-analyzer — Phase 1: 專案基礎、認證、頁面探索

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 nuxt-seo-analyzer 的專案骨架：Nuxt 3 + Cloudflare Pages、Google OAuth2 登入（Supabase Auth）、資料庫 schema、每日用量追蹤，以及從 sitemap.xml 與首頁掃描頁面清單的探索功能。完成後使用者可以：登入 → 輸入網域 → 看到頁面清單 → 勾選最多 10 頁準備分析。

**Architecture:** Nuxt 3 Nitro server routes 以 Cloudflare Workers 形式運行。Supabase 負責 Google OAuth2 認證與 PostgreSQL 儲存。頁面探索用原生 `fetch` 抓取 sitemap.xml，再用 `fast-xml-parser` 解析，並用 `cheerio` 從首頁抽取內部連結作為備援。

**Tech Stack:** Nuxt 3、TypeScript、Tailwind CSS、@nuxtjs/supabase、cheerio、fast-xml-parser、Vitest

---

## 檔案結構（本計畫將建立的檔案）

```
nuxt-seo-analyzer/
├── nuxt.config.ts                          # Nuxt 設定（Cloudflare preset、模組）
├── package.json
├── .env.example                            # 環境變數範本
├── tsconfig.json
│
├── supabase/
│   └── schema.sql                          # 資料庫 DDL（在 Supabase SQL 編輯器執行）
│
├── middleware/
│   └── auth.ts                             # 未登入自動跳轉到登入頁
│
├── pages/
│   ├── index.vue                           # 登入頁（Google OAuth2 按鈕）
│   ├── dashboard.vue                       # 主頁：輸入網域 + 今日用量
│   └── analyze/
│       └── discover.vue                    # 頁面選擇（勾選 sitemap 結果）
│
├── server/
│   ├── utils/
│   │   ├── supabase.ts                     # server 端 Supabase client（service role）
│   │   ├── usage.ts                        # 用量查詢與遞增邏輯（共用，避免 Workers 自我 HTTP 呼叫）
│   │   └── discovery/
│   │       ├── sitemap.ts                  # sitemap.xml 解析器
│   │       └── homepage.ts                 # 首頁連結抽取（cheerio）
│   └── api/
│       ├── usage/
│       │   ├── check.get.ts               # 取得今日剩餘額度
│       │   └── increment.post.ts          # 消耗一次網域額度
│       └── analyze/
│           └── discover.post.ts           # 掃描網域頁面清單
│
└── tests/
    └── server/
        └── utils/
            ├── sitemap.test.ts
            └── homepage.test.ts
```

---

## Task 1：初始化 Nuxt 3 專案

**Files:**
- Create: `nuxt.config.ts`
- Create: `package.json`（由 nuxi 產生，需追加依賴）
- Create: `.env.example`

- [ ] **Step 1：建立專案**

在 `C:\Users\User\Documents\GitHub\` 執行：

```bash
npx nuxi@latest init nuxt-seo-analyzer
cd nuxt-seo-analyzer
```

選項選擇：
- Package manager: `npm`
- 其餘維持預設

- [ ] **Step 2：安裝所有依賴**

```bash
npm install @nuxtjs/supabase @nuxt/ui fast-xml-parser cheerio openai
npm install -D vitest @nuxt/test-utils happy-dom
```

- [ ] **Step 3：寫入 `nuxt.config.ts`**

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2025-01-01',

  modules: ['@nuxtjs/supabase', '@nuxt/ui'],

  nitro: {
    preset: 'cloudflare-pages',
  },

  supabase: {
    redirectOptions: {
      login: '/',
      callback: '/confirm',
      exclude: ['/'],
    },
  },

  runtimeConfig: {
    // server-only（不暴露給前端）
    openaiApiKey: '',
    serpApiKeys: '',
    apifyKeys: '',
    scraperApiKeys: '',
    pagespeedApiKey: '',
    supabaseServiceRoleKey: '',
    appDailyDomainLimit: '5',
    appMaxPagesPerRun: '10',
  },
})
```

- [ ] **Step 4：建立 `.env.example`**

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
NUXT_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
NUXT_OPENAI_API_KEY=sk-...

# 索引檢查（JSON 字串陣列）
NUXT_SERP_API_KEYS=["key1","key2"]
NUXT_APIFY_KEYS=["key1"]
NUXT_SCRAPER_API_KEYS=["key1"]

# Google PageSpeed Insights
NUXT_PAGESPEED_API_KEY=AIza...

# 應用程式限制
NUXT_APP_DAILY_DOMAIN_LIMIT=5
NUXT_APP_MAX_PAGES_PER_RUN=10
```

複製為 `.env` 並填入真實值。

- [ ] **Step 5：設定 Vitest**

在 `nuxt.config.ts` 追加：

```ts
// 在 defineNuxtConfig 內新增
vitest: {
  // Nuxt test utils 需要
},
```

建立 `vitest.config.ts`：

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 6：確認開發伺服器可啟動**

```bash
npm run dev
```

Expected: 瀏覽器開啟 `http://localhost:3000` 看到 Nuxt 預設畫面，無 console error。

- [ ] **Step 7：Commit**

```bash
git init
git add .
git commit -m "chore: init nuxt3 project with cloudflare-pages preset"
```

---

## Task 2：Supabase 資料庫 Schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1：建立 `supabase/schema.sql`**

```sql
-- ========================================
-- nuxt-seo-analyzer 資料庫 Schema
-- 在 Supabase Dashboard > SQL Editor 執行
-- ========================================

-- 每日使用量追蹤
CREATE TABLE IF NOT EXISTS daily_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  domain_count INT  NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

-- 分析工作階段
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','error')),
  page_count  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每頁分析結果
CREATE TABLE IF NOT EXISTS page_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  meta_tags       JSONB,
  core_web_vitals JSONB,
  robots_sitemap  JSONB,
  schema_data     JSONB,
  headings        JSONB,
  images          JSONB,
  indexing        JSONB,
  ai_report       TEXT,
  analyzed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- Row Level Security（RLS）
-- ========================================
ALTER TABLE daily_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_analyses     ENABLE ROW LEVEL SECURITY;

-- daily_usage：只能讀寫自己的資料
CREATE POLICY "users_own_usage" ON daily_usage
  FOR ALL USING (auth.uid() = user_id);

-- analysis_sessions：只能讀寫自己的資料
CREATE POLICY "users_own_sessions" ON analysis_sessions
  FOR ALL USING (auth.uid() = user_id);

-- page_analyses：只能讀寫自己 session 的資料
CREATE POLICY "users_own_analyses" ON page_analyses
  FOR ALL USING (
    session_id IN (
      SELECT id FROM analysis_sessions WHERE user_id = auth.uid()
    )
  );
```

- [ ] **Step 2：在 Supabase 執行 SQL**

1. 開啟 [Supabase Dashboard](https://app.supabase.com)
2. 進入你的專案 → SQL Editor
3. 貼入上方 SQL → Run
4. 確認 Table Editor 中出現 `daily_usage`、`analysis_sessions`、`page_analyses` 三張表

- [ ] **Step 3：設定 Google OAuth2**

在 Supabase Dashboard：
1. Authentication → Providers → Google → Enable
2. 填入 Google Cloud Console 的 Client ID 與 Client Secret
3. 將 `https://your-project.supabase.co/auth/v1/callback` 加入 Google Cloud Console 的授權重新導向 URI

- [ ] **Step 4：Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add supabase schema with RLS policies"
```

---

## Task 3：伺服器端 Supabase Client

**Files:**
- Create: `server/utils/supabase.ts`

- [ ] **Step 1：建立 `server/utils/supabase.ts`**

```ts
// server/utils/supabase.ts
// 使用 service role key，繞過 RLS，僅在 server routes 使用
import { createClient } from '@supabase/supabase-js'

export function useServerSupabase() {
  const config = useRuntimeConfig()
  return createClient(
    process.env.SUPABASE_URL!,
    config.supabaseServiceRoleKey,
    { auth: { persistSession: false } }
  )
}
```

- [ ] **Step 2：Commit**

```bash
git add server/utils/supabase.ts
git commit -m "feat: add server-side supabase client with service role"
```

---

## Task 4：Auth Middleware 與登入頁

**Files:**
- Create: `middleware/auth.ts`
- Create: `pages/index.vue`
- Create: `pages/confirm.vue`（OAuth 回呼過渡頁）

- [ ] **Step 1：建立 `middleware/auth.ts`**

```ts
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  // 登入頁與 OAuth 回呼頁不需要驗證
  if (to.path === '/' || to.path === '/confirm') return
  if (!user.value) return navigateTo('/')
})
```

- [ ] **Step 2：在 `nuxt.config.ts` 啟用全域 middleware**

```ts
// 在 defineNuxtConfig 內追加
router: {
  middleware: ['auth'],
},
```

- [ ] **Step 3：建立 `pages/index.vue`（登入頁）**

```vue
<!-- pages/index.vue -->
<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-sm text-center">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">SEO 分析工具</h1>
      <p class="text-gray-500 text-sm mb-8">以 Google 帳號登入開始使用</p>
      <UButton
        color="white"
        variant="solid"
        size="lg"
        class="w-full"
        :loading="loading"
        @click="signIn"
      >
        <template #leading>
          <img src="https://www.google.com/favicon.ico" class="w-4 h-4" alt="Google" />
        </template>
        以 Google 帳號登入
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const loading = ref(false)

async function signIn() {
  loading.value = true
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/confirm`,
    },
  })
  loading.value = false
}
</script>
```

- [ ] **Step 4：建立 `pages/confirm.vue`（OAuth 回呼過渡頁）**

```vue
<!-- pages/confirm.vue -->
<template>
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-gray-500">登入中，請稍候...</p>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const user = useSupabaseUser()

watchEffect(() => {
  if (user.value) navigateTo('/dashboard')
})
</script>
```

- [ ] **Step 5：手動測試登入流程**

```bash
npm run dev
```

1. 開啟 `http://localhost:3000`
2. 點擊「以 Google 帳號登入」
3. 完成 Google OAuth2 流程
4. 應跳轉到 `/dashboard`（目前是 404，正常）

- [ ] **Step 6：Commit**

```bash
git add middleware/auth.ts pages/index.vue pages/confirm.vue nuxt.config.ts
git commit -m "feat: add google oauth2 login with supabase auth"
```

---

## Task 5：每日用量追蹤（共用工具 + API）

**Files:**
- Create: `server/utils/usage.ts`         ← 核心邏輯（供 API routes 直接呼叫，避免 Workers 自我 HTTP 呼叫）
- Create: `server/api/usage/check.get.ts`
- Create: `server/api/usage/increment.post.ts`

- [ ] **Step 1：建立 `server/utils/usage.ts`（核心邏輯）**

```ts
// server/utils/usage.ts
// 用量邏輯抽成獨立工具，讓 discover route 直接 import，
// 避免在 Cloudflare Workers 中對自身發出 HTTP 請求。
import { useServerSupabase } from '~/server/utils/supabase'

export interface UsageInfo {
  used: number
  limit: number
  remaining: number
}

export async function getUsage(userId: string, dailyLimit: number): Promise<UsageInfo> {
  const supabase = useServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('daily_usage')
    .select('domain_count')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  const used = data?.domain_count ?? 0
  return { used, limit: dailyLimit, remaining: Math.max(0, dailyLimit - used) }
}

export async function incrementUsage(userId: string, dailyLimit: number): Promise<void> {
  const supabase = useServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('daily_usage')
    .select('id, domain_count')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  if (existing && existing.domain_count >= dailyLimit) {
    throw createError({ statusCode: 429, message: `今日額度已用完（上限 ${dailyLimit} 個網域）` })
  }

  if (existing) {
    await supabase
      .from('daily_usage')
      .update({ domain_count: existing.domain_count + 1 })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('daily_usage')
      .insert({ user_id: userId, date: today, domain_count: 1 })
  }
}
```

- [ ] **Step 2：建立 `server/api/usage/check.get.ts`**

```ts
// server/api/usage/check.get.ts
import { getUsage } from '~/server/utils/usage'

export default defineEventHandler(async (event) => {
  const supabase = useServerSupabase()
  const config = useRuntimeConfig()
  const limit = Number(config.appDailyDomainLimit)

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  return await getUsage(user.id, limit)
})
```

- [ ] **Step 3：建立 `server/api/usage/increment.post.ts`**

```ts
// server/api/usage/increment.post.ts
import { incrementUsage } from '~/server/utils/usage'

export default defineEventHandler(async (event) => {
  const supabase = useServerSupabase()
  const config = useRuntimeConfig()

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  await incrementUsage(user.id, Number(config.appDailyDomainLimit))
  return { status: 'ok' }
})
```

- [ ] **Step 4：Commit**

```bash
git add server/utils/usage.ts server/api/usage/
git commit -m "feat: add daily domain usage tracking (shared util + api routes)"
```

---

## Task 6：Sitemap 解析器

**Files:**
- Create: `server/utils/discovery/sitemap.ts`
- Create: `tests/server/utils/sitemap.test.ts`

- [ ] **Step 1：寫 failing test**

```ts
// tests/server/utils/sitemap.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSitemapUrls } from '../../../server/utils/discovery/sitemap'

describe('fetchSitemapUrls', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('標準 sitemap.xml：回傳 URL 清單', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(xml),
    }))

    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toHaveLength(2)
    expect(urls[0].loc).toBe('https://example.com/')
    expect(urls[0].lastmod).toBe('2026-01-01')
    expect(urls[1].loc).toBe('https://example.com/about')
  })

  it('sitemap 不存在（404）：回傳空陣列', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toEqual([])
  })

  it('fetch 失敗（timeout）：回傳空陣列', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toEqual([])
  })

  it('單一 url 元素（非陣列）也能正確解析', async () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/only</loc></url>
</urlset>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(xml),
    }))

    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toHaveLength(1)
    expect(urls[0].loc).toBe('https://example.com/only')
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/sitemap.test.ts
```

Expected: FAIL — `Cannot find module '../../../server/utils/discovery/sitemap'`

- [ ] **Step 3：實作 `server/utils/discovery/sitemap.ts`**

```ts
// server/utils/discovery/sitemap.ts
import { XMLParser } from 'fast-xml-parser'

export interface SitemapUrl {
  loc: string
  lastmod?: string
  priority?: number
}

export async function fetchSitemapUrls(domain: string): Promise<SitemapUrl[]> {
  const base = domain.replace(/\/$/, '')
  const sitemapUrl = `${base}/sitemap.xml`

  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []

    const xml = await res.text()
    return parseUrlset(xml)
  } catch {
    return []
  }
}

function parseUrlset(xml: string): SitemapUrl[] {
  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(xml)

  // 標準 urlset
  const urlset = parsed?.urlset?.url
  if (urlset) {
    const arr = Array.isArray(urlset) ? urlset : [urlset]
    return arr
      .filter((u: any) => u?.loc)
      .map((u: any) => ({
        loc: String(u.loc),
        lastmod: u.lastmod ? String(u.lastmod) : undefined,
        priority: u.priority ? Number(u.priority) : undefined,
      }))
  }

  return []
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/sitemap.test.ts
```

Expected: PASS — 4 tests passed

- [ ] **Step 5：Commit**

```bash
git add server/utils/discovery/sitemap.ts tests/server/utils/sitemap.test.ts
git commit -m "feat: add sitemap.xml parser with tests"
```

---

## Task 7：首頁連結抽取器（cheerio）

**Files:**
- Create: `server/utils/discovery/homepage.ts`
- Create: `tests/server/utils/homepage.test.ts`

- [ ] **Step 1：寫 failing test**

```ts
// tests/server/utils/homepage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchHomepageLinks } from '../../../server/utils/discovery/homepage'

const mockHtml = `<!DOCTYPE html>
<html>
<body>
  <a href="/about">About</a>
  <a href="/blog/post-1">Post 1</a>
  <a href="https://example.com/contact">Contact</a>
  <a href="https://other.com/external">External</a>
  <a href="/about">About duplicate</a>
  <a href="mailto:test@test.com">Email</a>
  <a href="#anchor">Anchor</a>
</body>
</html>`

describe('fetchHomepageLinks', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('只回傳同網域的內部連結，去除重複', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    }))

    const links = await fetchHomepageLinks('https://example.com')
    // 應包含 /about, /blog/post-1, /contact，不含 external、mailto、anchor
    expect(links).toContain('https://example.com/about')
    expect(links).toContain('https://example.com/blog/post-1')
    expect(links).toContain('https://example.com/contact')
    expect(links).not.toContain('https://other.com/external')
    // 去除重複
    expect(links.filter(l => l === 'https://example.com/about')).toHaveLength(1)
  })

  it('fetch 失敗：回傳空陣列', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const links = await fetchHomepageLinks('https://example.com')
    expect(links).toEqual([])
  })

  it('回傳數量上限為 50', async () => {
    const manyLinks = Array.from({ length: 100 }, (_, i) => `<a href="/page-${i}">P${i}</a>`).join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`<html><body>${manyLinks}</body></html>`),
    }))

    const links = await fetchHomepageLinks('https://example.com')
    expect(links.length).toBeLessThanOrEqual(50)
  })
})
```

- [ ] **Step 2：執行 test 確認 FAIL**

```bash
npx vitest run tests/server/utils/homepage.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3：實作 `server/utils/discovery/homepage.ts`**

```ts
// server/utils/discovery/homepage.ts
import * as cheerio from 'cheerio'

export async function fetchHomepageLinks(domain: string): Promise<string[]> {
  const base = domain.replace(/\/$/, '')

  try {
    const res = await fetch(base, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []

    const html = await res.text()
    return extractInternalLinks(html, base)
  } catch {
    return []
  }
}

function extractInternalLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html)
  const origin = new URL(base).origin
  const seen = new Set<string>()
  const links: string[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return
    }

    let absolute: string
    try {
      absolute = new URL(href, base).href
    } catch {
      return
    }

    // 只保留同網域連結
    if (!absolute.startsWith(origin)) return

    // 移除 hash 與 query（保留 path）
    const clean = absolute.split('#')[0].split('?')[0]
    if (!seen.has(clean)) {
      seen.add(clean)
      links.push(clean)
    }
  })

  return links.slice(0, 50)
}
```

- [ ] **Step 4：執行 test 確認 PASS**

```bash
npx vitest run tests/server/utils/homepage.test.ts
```

Expected: PASS — 3 tests passed

- [ ] **Step 5：Commit**

```bash
git add server/utils/discovery/homepage.ts tests/server/utils/homepage.test.ts
git commit -m "feat: add homepage link extractor with cheerio"
```

---

## Task 8：Discover API 路由

**Files:**
- Create: `server/api/analyze/discover.post.ts`

- [ ] **Step 1：建立 `server/api/analyze/discover.post.ts`**

```ts
// server/api/analyze/discover.post.ts
// 輸入網域 → 消耗用量額度 → 掃 sitemap + 首頁 → 回傳頁面清單
import { fetchSitemapUrls } from '~/server/utils/discovery/sitemap'
import { fetchHomepageLinks } from '~/server/utils/discovery/homepage'
import { incrementUsage } from '~/server/utils/usage'

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

  // 正規化網域（確保有 https://）
  let domain = body.domain.trim()
  if (!domain.startsWith('http')) domain = `https://${domain}`

  // 驗證格式
  try {
    new URL(domain)
  } catch {
    throw createError({ statusCode: 400, message: '網域格式不正確' })
  }

  // 驗證登入並消耗每日額度（直接呼叫工具函式，避免 Workers 自我 HTTP 請求）
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  await incrementUsage(user.id, Number(config.appDailyDomainLimit))

  // 平行掃描 sitemap 與首頁
  const [sitemapUrls, homepageLinks] = await Promise.all([
    fetchSitemapUrls(domain),
    fetchHomepageLinks(domain),
  ])

  // 合併並去重（sitemap 優先，保留 lastmod 資訊）
  const seen = new Set<string>()
  const pages: Array<{ url: string; lastmod?: string; source: 'sitemap' | 'homepage' }> = []

  for (const u of sitemapUrls) {
    if (!seen.has(u.loc)) {
      seen.add(u.loc)
      pages.push({ url: u.loc, lastmod: u.lastmod, source: 'sitemap' })
    }
  }

  for (const link of homepageLinks) {
    if (!seen.has(link)) {
      seen.add(link)
      pages.push({ url: link, source: 'homepage' })
    }
  }

  // 上限 100 頁
  const config = useRuntimeConfig()
  const limited = pages.slice(0, 100)

  return {
    domain,
    total: limited.length,
    pages: limited,
    maxSelect: Number(config.appMaxPagesPerRun),
  }
})
```

- [ ] **Step 2：手動測試 API**

```bash
npm run dev
```

用 curl 測試（替換 YOUR_JWT 為 Supabase 登入後的 access_token）：

```bash
curl -X POST http://localhost:3000/api/analyze/discover \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"domain":"https://nuxt.com"}'
```

Expected: 回傳 `{ domain, total, pages: [...], maxSelect: 10 }`

- [ ] **Step 3：Commit**

```bash
git add server/api/analyze/discover.post.ts
git commit -m "feat: add discover api route (sitemap + homepage merge)"
```

---

## Task 9：Dashboard 頁面

**Files:**
- Create: `pages/dashboard.vue`

- [ ] **Step 1：建立 `pages/dashboard.vue`**

```vue
<!-- pages/dashboard.vue -->
<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-2xl mx-auto space-y-6">

      <!-- 標題列 -->
      <header class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900">SEO 分析工具</h1>
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-500">
            今日剩餘：
            <span :class="remaining === 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'">
              {{ remaining }} / {{ limit }} 個網域
            </span>
          </span>
          <UButton variant="ghost" size="sm" @click="signOut">登出</UButton>
        </div>
      </header>

      <!-- 輸入區 -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-gray-800">分析新網域</h2>
        </template>

        <div class="flex gap-3">
          <UInput
            v-model="domain"
            placeholder="輸入網域，例如：example.com"
            class="flex-1"
            :disabled="remaining === 0 || loading"
            @keyup.enter="startDiscover"
          />
          <UButton
            :loading="loading"
            :disabled="remaining === 0 || !domain.trim()"
            @click="startDiscover"
          >
            開始分析
          </UButton>
        </div>

        <p v-if="remaining === 0" class="text-sm text-red-500 mt-2">
          今日額度已用完，明天再來。
        </p>
        <p v-if="error" class="text-sm text-red-500 mt-2">{{ error }}</p>
      </UCard>

      <!-- 歷史紀錄（Phase 3 實作，目前顯示佔位） -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-gray-800">最近分析紀錄</h2>
        </template>
        <p class="text-gray-400 text-sm">（歷史紀錄功能將在 Phase 3 加入）</p>
      </UCard>

    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const supabase = useSupabaseClient()
const domain = ref('')
const loading = ref(false)
const error = ref('')
const used = ref(0)
const limit = ref(5)
const remaining = computed(() => Math.max(0, limit.value - used.value))

// 取得今日用量
async function loadUsage() {
  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token
  if (!token) return

  const data = await $fetch('/api/usage/check', {
    headers: { authorization: `Bearer ${token}` },
  })
  used.value = (data as any).used
  limit.value = (data as any).limit
}

// 開始探索
async function startDiscover() {
  error.value = ''
  loading.value = true

  const session = await supabase.auth.getSession()
  const token = session.data.session?.access_token

  try {
    const result = await $fetch('/api/analyze/discover', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { domain: domain.value },
    })
    // 跳轉到頁面選擇
    await navigateTo({
      path: '/analyze/discover',
      query: { data: JSON.stringify(result) },
    })
  } catch (e: any) {
    error.value = e?.data?.message ?? '發生錯誤，請稍後再試'
    await loadUsage() // 重新載入用量
  } finally {
    loading.value = false
  }
}

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/')
}

onMounted(loadUsage)
</script>
```

- [ ] **Step 2：手動測試 Dashboard**

1. `npm run dev` → 登入後進入 `/dashboard`
2. 確認顯示今日剩餘額度
3. 輸入 `nuxt.com` → 點擊開始分析
4. 確認會跳轉到 `/analyze/discover`（目前 404）

- [ ] **Step 3：Commit**

```bash
git add pages/dashboard.vue
git commit -m "feat: add dashboard page with domain input and usage display"
```

---

## Task 10：Discover 頁面（頁面選擇）

**Files:**
- Create: `pages/analyze/discover.vue`

- [ ] **Step 1：建立 `pages/analyze/discover.vue`**

```vue
<!-- pages/analyze/discover.vue -->
<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-3xl mx-auto space-y-6">

      <header class="flex items-center gap-4">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/dashboard')">
          返回
        </UButton>
        <div>
          <h1 class="text-xl font-bold text-gray-900">選擇要分析的頁面</h1>
          <p class="text-sm text-gray-500">{{ discoverData?.domain }}</p>
        </div>
      </header>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-semibold">
              共找到 {{ discoverData?.total ?? 0 }} 個頁面
            </span>
            <div class="flex gap-2">
              <UButton variant="ghost" size="sm" @click="selectAll">全選</UButton>
              <UButton variant="ghost" size="sm" @click="clearAll">清除</UButton>
              <span class="text-sm text-gray-500 self-center">
                已選 {{ selected.size }} / {{ maxSelect }}
              </span>
            </div>
          </div>
        </template>

        <div class="divide-y max-h-[500px] overflow-y-auto">
          <label
            v-for="page in discoverData?.pages ?? []"
            :key="page.url"
            class="flex items-center gap-3 py-3 px-2 hover:bg-gray-50 cursor-pointer"
          >
            <UCheckbox
              :model-value="selected.has(page.url)"
              :disabled="!selected.has(page.url) && selected.size >= maxSelect"
              @update:model-value="toggle(page.url)"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 truncate">{{ page.url }}</p>
              <p class="text-xs text-gray-400">
                {{ page.source === 'sitemap' ? '來自 sitemap' : '來自首頁連結' }}
                <span v-if="page.lastmod"> · 最後修改：{{ page.lastmod }}</span>
              </p>
            </div>
          </label>
        </div>

        <template #footer>
          <div class="flex justify-between items-center">
            <p class="text-sm text-gray-500">最多可選 {{ maxSelect }} 頁</p>
            <UButton
              :disabled="selected.size === 0"
              @click="startAnalysis"
            >
              開始分析（{{ selected.size }} 頁）
            </UButton>
          </div>
        </template>
      </UCard>

    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

interface DiscoverPage {
  url: string
  lastmod?: string
  source: 'sitemap' | 'homepage'
}

interface DiscoverData {
  domain: string
  total: number
  pages: DiscoverPage[]
  maxSelect: number
}

const route = useRoute()

// 從 query string 取得 discover 結果
const discoverData = computed<DiscoverData | null>(() => {
  try {
    return JSON.parse(route.query.data as string)
  } catch {
    return null
  }
})

const maxSelect = computed(() => discoverData.value?.maxSelect ?? 10)
const selected = ref(new Set<string>())

function toggle(url: string) {
  if (selected.value.has(url)) {
    selected.value.delete(url)
  } else if (selected.value.size < maxSelect.value) {
    selected.value.add(url)
  }
  // 觸發 Vue 響應式更新
  selected.value = new Set(selected.value)
}

function selectAll() {
  const urls = (discoverData.value?.pages ?? []).slice(0, maxSelect.value).map(p => p.url)
  selected.value = new Set(urls)
}

function clearAll() {
  selected.value = new Set()
}

function startAnalysis() {
  // Phase 2 實作：呼叫 /api/analyze/run
  // 目前先 console.log 確認資料正確
  console.log('選取的頁面：', [...selected.value])
  alert(`Phase 2 待實作：將分析 ${selected.value.size} 個頁面`)
}
</script>
```

- [ ] **Step 2：手動測試完整流程**

1. `npm run dev`
2. 登入 → Dashboard → 輸入 `nuxt.com` → 開始分析
3. 確認 Discover 頁面顯示頁面清單
4. 測試勾選（上限 10 頁）、全選、清除功能
5. 點擊「開始分析」確認 console 顯示選取的 URL

- [ ] **Step 3：Commit**

```bash
git add pages/analyze/discover.vue
git commit -m "feat: add discover page with page selection ui"
```

---

## 完成確認清單

Phase 1 完成後，以下所有流程應可正常運作：

- [ ] `npm run dev` 無錯誤啟動
- [ ] `npx vitest run` — sitemap 與 homepage 測試全數通過
- [ ] 瀏覽器登入（Google OAuth2）→ 跳轉到 `/dashboard`
- [ ] Dashboard 顯示今日剩餘額度
- [ ] 輸入網域 → 呼叫 discover API → 跳轉到 `/analyze/discover`
- [ ] Discover 頁面顯示頁面清單，勾選上限 10 頁正確運作
- [ ] 超過每日 5 個網域上限時，API 回傳 429 錯誤

---

## 下一步：Phase 2

**Plan 2** 將實作：
- 7 大分析模組（meta、CWV、robots、schema、headings、images、indexing）
- 三引擎降級索引檢查（SerpApi → Apify → ScraperAPI）
- GPT-4o-mini 中文報告生成
- Session 管理與分析執行 API（`/api/analyze/run`）
