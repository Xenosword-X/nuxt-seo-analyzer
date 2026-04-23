# Interview Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加入 GitHub Actions CI badge 與公開分享連結，讓面試官能無摩擦評估專案品質。

**Architecture:** CI workflow 跑現有 69 個 Vitest 測試並更新 README badge；公開分享連結透過新增 `share_token` UUID 欄位到 `analysis_sessions`，搭配無需認證的 `/api/share/[token]` API 與 `/share/[token]` 頁面實現。Auth middleware 白名單補上 `/share/` 路徑，service role key（已存在）繞過 RLS。

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Supabase (PostgreSQL + RLS), Cloudflare Workers, Vitest, GitHub Actions

---

## 檔案地圖

| 動作 | 路徑 | 說明 |
|------|------|------|
| 建立 | `.github/workflows/ci.yml` | GitHub Actions CI workflow |
| 修改 | `README.md` | 加入 CI badge |
| 修改 | `supabase/schema.sql` | 加入 share_token migration 段落 |
| 建立 | `server/api/share/[token].get.ts` | 公開分享 API（無需認證） |
| 修改 | `server/api/analyze/status/[sessionId].get.ts` | 回傳 share_token 欄位 |
| 修改 | `app/middleware/auth.global.ts` | 白名單補 /share/ 路徑 |
| 建立 | `app/pages/share/[token].vue` | 公開分享報告頁 |
| 修改 | `app/pages/analyze/result/[sessionId].vue` | 加入「複製分享連結」按鈕 |

---

## Task 1：GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (line 3, 標題下方)

- [ ] **Step 1：建立 workflow 目錄並寫入 CI yml**

建立 `.github/workflows/ci.yml`，內容如下：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx vitest run
```

- [ ] **Step 2：在本機確認測試全過**

```bash
npx vitest run
```

Expected: 69 tests pass，0 failures。

- [ ] **Step 3：在 README.md 標題下方加入 badge**

在 `README.md` 第 3 行（`> 繁體中文 SEO 深度分析工具...` 之前）插入：

```markdown
![CI](https://github.com/Xenosword-X/nuxt-seo-analyzer/actions/workflows/ci.yml/badge.svg)

```

修改後 README 頂部應為：

```markdown
# nuxt-seo-analyzer

![CI](https://github.com/Xenosword-X/nuxt-seo-analyzer/actions/workflows/ci.yml/badge.svg)

> 繁體中文 SEO 深度分析工具 — 以繁體中文為核心、由 AI 自動產生健診報告的 SEO 分析平台。
```

- [ ] **Step 4：Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: add GitHub Actions workflow + README badge"
```

---

## Task 2：DB Migration — 新增 share_token 欄位

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1：在 schema.sql 末尾加入 migration 段落**

在 `supabase/schema.sql` 最後一行後附加：

```sql

-- ========================================
-- 2026-04-23 Migration：公開分享連結
-- ========================================
ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid();
```

- [ ] **Step 2：在 Supabase Dashboard 執行 SQL**

前往 Supabase Dashboard → SQL Editor，執行以下語句：

```sql
ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid();
```

Expected：Statement 成功執行，現有所有 row 自動被填入隨機 UUID。

驗證：

```sql
SELECT id, domain, share_token FROM analysis_sessions LIMIT 5;
```

Expected：每一列的 `share_token` 都是非 null 的 UUID。

- [ ] **Step 3：Commit**

```bash
git add supabase/schema.sql
git commit -m "db: add share_token column to analysis_sessions"
```

---

## Task 3：公開分享 API

**Files:**
- Create: `server/api/share/[token].get.ts`

- [ ] **Step 1：建立 API 檔案**

建立 `server/api/share/[token].get.ts`：

```ts
// server/api/share/[token].get.ts
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, message: '缺少 token' })

  const supabase = useServerSupabase(event)

  const { data: session } = await supabase
    .from('analysis_sessions')
    .select('id, domain, status, page_count, created_at, site_pages_indexed, site_images_indexed, site_indexing_engine, site_indexing_cached, ai_report')
    .eq('share_token', token)
    .eq('status', 'done')
    .single()

  if (!session) throw createError({ statusCode: 404, message: '找不到分享報告或報告尚未完成' })

  const { data: analyses } = await supabase
    .from('page_analyses')
    .select('id, url, meta_tags, core_web_vitals, robots_sitemap, schema_data, headings, images, indexing, analyzed_at')
    .eq('session_id', session.id)
    .order('analyzed_at', { ascending: true })

  return {
    id: session.id,
    status: session.status,
    domain: session.domain,
    page_count: session.page_count,
    created_at: session.created_at,
    site_pages_indexed: session.site_pages_indexed ?? null,
    site_images_indexed: session.site_images_indexed ?? null,
    site_indexing_engine: session.site_indexing_engine ?? null,
    site_indexing_cached: session.site_indexing_cached ?? false,
    ai_report: session.ai_report ?? null,
    analyses: analyses ?? [],
  }
})
```

注意：select 中**刻意不包含** `user_id` 與 `share_token`，避免洩漏使用者資訊。

- [ ] **Step 2：手動測試 API**

啟動開發伺服器（`npm run dev`），從 Supabase 取一個真實的 `share_token`：

```sql
SELECT share_token FROM analysis_sessions WHERE status = 'done' LIMIT 1;
```

用 curl 或瀏覽器測試：

```bash
curl http://localhost:3000/api/share/<取得的token>
```

Expected：JSON 回傳包含 `domain`, `analyses` 陣列。

```bash
curl http://localhost:3000/api/share/00000000-0000-0000-0000-000000000000
```

Expected：`{ statusCode: 404, message: '找不到分享報告或報告尚未完成' }`

- [ ] **Step 3：Commit**

```bash
git add server/api/share/
git commit -m "feat(api): add public share endpoint GET /api/share/[token]"
```

---

## Task 4：Status Endpoint 回傳 share_token

**Files:**
- Modify: `server/api/analyze/status/[sessionId].get.ts`

- [ ] **Step 1：在 return 物件加入 share_token 欄位**

找到 `server/api/analyze/status/[sessionId].get.ts` 的 return 區塊（約第 28-44 行），加入 `share_token` 一行：

目前的 return：
```ts
  return {
    id: session.id,
    status: session.status,
    domain: session.domain,
    page_count: session.page_count,
    created_at: session.created_at,
    site_pages_indexed: session.site_pages_indexed ?? null,
    site_images_indexed: session.site_images_indexed ?? null,
    site_indexing_engine: session.site_indexing_engine ?? null,
    site_indexing_cached: session.site_indexing_cached ?? false,
    ai_report: session.ai_report ?? null,
    progress: {
      completed: (analyses ?? []).length,
      total: session.page_count,
    },
    analyses: analyses ?? [],
  }
```

改為（加入 `share_token` 那一行）：

```ts
  return {
    id: session.id,
    status: session.status,
    domain: session.domain,
    page_count: session.page_count,
    created_at: session.created_at,
    share_token: session.share_token ?? null,
    site_pages_indexed: session.site_pages_indexed ?? null,
    site_images_indexed: session.site_images_indexed ?? null,
    site_indexing_engine: session.site_indexing_engine ?? null,
    site_indexing_cached: session.site_indexing_cached ?? false,
    ai_report: session.ai_report ?? null,
    progress: {
      completed: (analyses ?? []).length,
      total: session.page_count,
    },
    analyses: analyses ?? [],
  }
```

- [ ] **Step 2：驗證**

```bash
npx vitest run
```

Expected：69 tests pass（無新測試，確認沒有破壞現有邏輯）。

- [ ] **Step 3：Commit**

```bash
git add server/api/analyze/status/
git commit -m "feat(api): expose share_token in status endpoint response"
```

---

## Task 5：Auth Middleware 白名單補 /share/ 路徑

**Files:**
- Modify: `app/middleware/auth.global.ts`

- [ ] **Step 1：修改 middleware 加入 /share/ 白名單**

`app/middleware/auth.global.ts` 目前內容：

```ts
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  if (to.path === '/' || to.path === '/confirm') return
  if (!user.value) return navigateTo('/')
})
```

改為：

```ts
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  if (to.path === '/' || to.path === '/confirm' || to.path.startsWith('/share/')) return
  if (!user.value) return navigateTo('/')
})
```

- [ ] **Step 2：驗證**

```bash
npx vitest run
```

Expected：69 tests pass。

- [ ] **Step 3：Commit**

```bash
git add app/middleware/auth.global.ts
git commit -m "feat(auth): whitelist /share/ routes from auth middleware"
```

---

## Task 6：公開分享報告頁

**Files:**
- Create: `app/pages/share/[token].vue`

- [ ] **Step 1：建立分享頁面**

建立 `app/pages/share/[token].vue`：

```vue
<!-- app/pages/share/[token].vue -->
<template>
  <div class="min-h-screen" style="background: linear-gradient(135deg, #f8fafc 0%, #f0f9ff 55%, #ecfeff 100%)">

    <!-- 公開分享 banner -->
    <div class="bg-gray-100 border-b border-gray-200 py-2 text-center">
      <p class="text-xs text-gray-500">此為公開分享報告，僅供檢視</p>
    </div>

    <!-- Top nav bar -->
    <header style="background: linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%); box-shadow: 0 4px 20px rgba(3,105,161,0.28)">
      <div class="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div>
          <h1 class="text-white font-bold text-base leading-tight">{{ sessionData?.domain }}</h1>
          <p class="text-white/60 text-xs">共 {{ analyses.length }} 頁分析結果</p>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-32">
      <div class="text-center">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse"
             style="background: linear-gradient(135deg, #0369a1, #0ea5e9)">
          <UIcon name="i-heroicons-magnifying-glass" class="w-6 h-6 text-white" />
        </div>
        <p class="text-gray-400 text-sm">載入中...</p>
      </div>
    </div>

    <!-- 找不到報告 -->
    <div v-else-if="notFound" class="flex items-center justify-center py-32">
      <div class="text-center">
        <p class="text-2xl mb-2">🔗</p>
        <p class="text-gray-600 font-medium">連結已失效或不存在</p>
        <p class="text-gray-400 text-sm mt-1">此分享連結可能已過期或輸入有誤</p>
      </div>
    </div>

    <div v-else class="max-w-6xl mx-auto px-6 py-6 flex gap-5 items-start">

      <!-- 左欄：頁面清單 -->
      <div class="w-64 shrink-0 space-y-1.5 sticky top-6">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-widest px-1 mb-3">已分析頁面</p>
        <div
          v-for="(analysis, i) in analyses"
          :key="analysis.id"
          class="cursor-pointer rounded-xl p-3 transition-all group"
          :class="selectedIndex === i
            ? 'bg-white shadow-md ring-1 ring-sky-200'
            : 'hover:bg-white/70'"
          @click="selectedIndex = i"
        >
          <div class="flex items-center gap-2">
            <span class="text-sm shrink-0">{{ pageStatusIcon(analysis) }}</span>
            <p class="text-xs text-gray-700 truncate font-medium group-hover:text-gray-900 transition-colors">
              {{ urlPath(analysis.url) }}
            </p>
          </div>
          <div class="flex items-center justify-between mt-1.5 ml-6">
            <p class="text-xs text-gray-400">{{ totalIssues(analysis) }} 個問題</p>
            <span v-if="selectedIndex === i" class="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
          </div>
        </div>
      </div>

      <!-- 右欄：詳細指標 -->
      <div v-if="selected" class="flex-1 space-y-4 min-w-0 animate-fade-up">

        <!-- 整站 Google 收錄概況 -->
        <section v-if="sessionData" class="bg-linear-to-br from-white to-sky-50 rounded-2xl p-6 shadow-md ring-1 ring-sky-100">
          <div class="flex items-center mb-4">
            <h2 class="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-sky-600" />
              整站 Google 收錄概況
            </h2>
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
            </div>
            <div>
              <p class="text-3xl font-bold tabular-nums"
                 :class="sessionData.site_images_indexed === 0 ? 'text-amber-600' : 'text-sky-700'">
                {{ formatNumber(sessionData.site_images_indexed) }}
              </p>
              <p class="text-xs text-gray-500 mt-1">圖片收錄</p>
            </div>
            <div>
              <p class="text-3xl font-bold text-gray-700 capitalize">{{ sessionData.site_indexing_engine || '—' }}</p>
              <p class="text-xs text-gray-500 mt-1">查詢引擎</p>
            </div>
          </div>
        </section>

        <!-- Meta Tags -->
        <div class="bg-white rounded-2xl card-elevated overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div class="flex items-center gap-2">
              <span class="text-base">📄</span>
              <span class="font-semibold text-gray-800 text-sm">Meta 標籤</span>
            </div>
            <ScoreBar :score="selected.meta_tags?.score ?? 0" />
          </div>
          <div class="px-5 py-4 space-y-2 text-sm">
            <MetaRow label="Title" :value="selected.meta_tags?.title" />
            <MetaRow label="Description" :value="selected.meta_tags?.description" />
            <MetaRow label="Canonical" :value="selected.meta_tags?.canonical" />
            <MetaRow label="og:image" :value="selected.meta_tags?.ogImage" />
            <IssueList :issues="selected.meta_tags?.issues ?? []" />
          </div>
        </div>

        <!-- Core Web Vitals -->
        <div class="bg-white rounded-2xl card-elevated overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div class="flex items-center gap-2">
              <span class="text-base">⚡</span>
              <span class="font-semibold text-gray-800 text-sm">Core Web Vitals</span>
            </div>
            <ScoreBar :score="selected.core_web_vitals?.speedScore ?? 0" />
          </div>
          <div class="px-5 py-4">
            <div class="grid grid-cols-2 gap-3 text-sm mb-3">
              <CWVItem label="FCP" :value="formatMs(selected.core_web_vitals?.fcp)" />
              <CWVItem label="LCP" :value="formatMs(selected.core_web_vitals?.lcp)" :warn="(selected.core_web_vitals?.lcp ?? 0) > 2500" />
              <CWVItem label="TBT" :value="formatMs(selected.core_web_vitals?.tbt)" />
              <CWVItem label="CLS" :value="selected.core_web_vitals?.cls?.toFixed(3) ?? 'N/A'" :warn="(selected.core_web_vitals?.cls ?? 0) > 0.1" />
            </div>
            <IssueList :issues="selected.core_web_vitals?.issues ?? []" />
          </div>
        </div>

        <!-- 索引狀態 + 標題結構 (2欄並排) -->
        <div class="grid grid-cols-2 gap-4">
          <!-- 索引狀態 -->
          <div class="bg-white rounded-2xl card-elevated overflow-hidden">
            <div class="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
              <span class="text-base">🔍</span>
              <span class="font-semibold text-gray-800 text-sm">Google 索引狀態</span>
            </div>
            <div class="px-5 py-4 text-sm space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-gray-500 text-xs">狀態</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="selected.indexing?.isIndexed ? 'status-good' : 'status-error'">
                  {{ selected.indexing?.isIndexed ? '✅ 已收錄' : '❌ 未收錄' }}
                </span>
              </div>
              <p v-if="selected.indexing?.resultCount != null">
                <span class="text-gray-500 text-xs">收錄數：</span>
                <span class="font-medium">{{ selected.indexing?.resultCount?.toLocaleString() }} 筆</span>
              </p>
              <p class="text-gray-400 text-xs">引擎：{{ selected.indexing?.engineUsed }}</p>
              <IssueList :issues="selected.indexing?.issues ?? []" />
            </div>
          </div>

          <!-- 標題結構 -->
          <div class="bg-white rounded-2xl card-elevated overflow-hidden">
            <div class="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
              <span class="text-base">🏷️</span>
              <span class="font-semibold text-gray-800 text-sm">標題結構</span>
            </div>
            <div class="px-5 py-4 text-sm space-y-2">
              <p><span class="text-gray-500 text-xs">H1：</span>
                <span class="font-medium">{{ selected.headings?.h1?.join('、') || '（無）' }}</span>
              </p>
              <div class="flex gap-4">
                <p><span class="text-gray-500 text-xs">H2：</span><span class="font-medium">{{ selected.headings?.h2Count ?? 0 }}</span></p>
                <p><span class="text-gray-500 text-xs">H3：</span><span class="font-medium">{{ selected.headings?.h3Count ?? 0 }}</span></p>
              </div>
              <p><span class="text-gray-500 text-xs">內部連結：</span>
                <span class="font-medium">{{ selected.headings?.internalLinkCount ?? 0 }} 個</span>
              </p>
              <IssueList :issues="selected.headings?.issues ?? []" />
            </div>
          </div>
        </div>

        <!-- 圖片 Alt + Schema (2欄並排) -->
        <div class="grid grid-cols-2 gap-4">
          <!-- 圖片 Alt -->
          <div class="bg-white rounded-2xl card-elevated overflow-hidden">
            <div class="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
              <span class="text-base">🖼️</span>
              <span class="font-semibold text-gray-800 text-sm">圖片 Alt 文字</span>
            </div>
            <div class="px-5 py-4 text-sm space-y-2">
              <p><span class="text-gray-500 text-xs">圖片總數：</span><span class="font-medium">{{ selected.images?.total ?? 0 }}</span></p>
              <div class="flex items-center gap-2">
                <span class="text-gray-500 text-xs">缺少 alt：</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="(selected.images?.missingAlt ?? 0) > 0 ? 'status-error' : 'status-good'">
                  {{ selected.images?.missingAlt ?? 0 }} 張
                </span>
              </div>
              <div v-if="(selected.images?.missingSrcs?.length ?? 0) > 0" class="mt-2 space-y-0.5">
                <p class="text-gray-400 text-xs mb-1">缺少 alt 的圖片：</p>
                <li
                  v-for="src in selected.images?.missingSrcs"
                  :key="src"
                  class="text-xs text-gray-600 truncate font-mono bg-gray-50 px-2 py-0.5 rounded list-none"
                >{{ src }}</li>
              </div>
              <IssueList :issues="selected.images?.issues ?? []" />
            </div>
          </div>

          <!-- Schema -->
          <div class="bg-white rounded-2xl card-elevated overflow-hidden">
            <div class="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
              <span class="text-base">📋</span>
              <span class="font-semibold text-gray-800 text-sm">結構化資料</span>
            </div>
            <div class="px-5 py-4 text-sm space-y-2">
              <div v-if="(selected.schema_data?.types?.length ?? 0) > 0" class="flex flex-wrap gap-1.5">
                <span
                  v-for="t in selected.schema_data?.types"
                  :key="t"
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style="background: #e0f2fe; color: #0369a1"
                >{{ t }}</span>
              </div>
              <p v-else class="text-gray-400 text-xs">未偵測到 JSON-LD</p>
              <IssueList :issues="selected.schema_data?.issues ?? []" />
            </div>
          </div>
        </div>

        <!-- Robots / Sitemap -->
        <div class="bg-white rounded-2xl card-elevated overflow-hidden">
          <div class="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
            <span class="text-base">🤖</span>
            <span class="font-semibold text-gray-800 text-sm">Robots / Sitemap</span>
          </div>
          <div class="px-5 py-4 text-sm flex gap-6">
            <div class="flex items-center gap-2">
              <span class="text-gray-500 text-xs">Robots.txt</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="selected.robots_sitemap?.robotsAllowed ? 'status-good' : 'status-error'">
                {{ selected.robots_sitemap?.robotsAllowed ? '✅ 允許爬取' : '❌ 封鎖爬取' }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500 text-xs">Sitemap.xml</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="selected.robots_sitemap?.sitemapExists ? 'status-good' : 'status-warn'">
                {{ selected.robots_sitemap?.sitemapExists ? '✅ 存在' : '⚠️ 未找到' }}
              </span>
            </div>
            <IssueList :issues="selected.robots_sitemap?.issues ?? []" />
          </div>
        </div>

        <!-- AI 報告 -->
        <div class="bg-white rounded-2xl card-elevated overflow-hidden">
          <div class="flex items-center gap-2 px-5 py-4 border-b border-gray-50"
               style="background: linear-gradient(135deg, #f0f9ff, #ecfeff)">
            <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background: linear-gradient(135deg, #0369a1, #0ea5e9)">
              <UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 text-white" />
            </div>
            <span class="font-semibold text-gray-800 text-sm">AI 中文 SEO 健診報告</span>
          </div>
          <div class="px-5 py-5 prose prose-sm max-w-none text-gray-700" v-html="renderedReport" />
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'

definePageMeta({ auth: false })

const route = useRoute()
const shareToken = route.params.token as string

const pending = ref(true)
const notFound = ref(false)
const sessionData = ref<any>(null)
const analyses = ref<any[]>([])
const selectedIndex = ref(0)

const selected = computed(() => analyses.value[selectedIndex.value] ?? null)

const renderedReport = computed(() => {
  const report = sessionData.value?.ai_report || selected.value?.ai_report
  if (!report) return '<p class="text-gray-400">（無報告）</p>'
  return marked(report) as string
})

async function load() {
  try {
    const result = await $fetch<any>(`/api/share/${shareToken}`)
    sessionData.value = result
    analyses.value = result.analyses ?? []
  } catch (err: any) {
    if (err?.statusCode === 404) {
      notFound.value = true
    }
  } finally {
    pending.value = false
  }
}

function urlPath(url: string) {
  try { return new URL(url).pathname || '/' } catch { return url }
}

function formatMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return 'N/A'
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'
}

function formatNumber(n: number | null | undefined) {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-US')
}

function totalIssues(analysis: any): number {
  return [
    analysis.meta_tags?.issues,
    analysis.core_web_vitals?.issues,
    analysis.robots_sitemap?.issues,
    analysis.schema_data?.issues,
    analysis.headings?.issues,
    analysis.images?.issues,
    analysis.indexing?.issues,
  ].flat().filter(Boolean).length
}

function pageStatusIcon(analysis: any): string {
  const count = totalIssues(analysis)
  if (count === 0) return '✅'
  if (count <= 2) return '⚠️'
  return '❌'
}

onMounted(load)
</script>
```

- [ ] **Step 2：瀏覽器驗證**

啟動 dev server（`npm run dev`），用 Supabase 取一個真實的 share_token：

```sql
SELECT share_token FROM analysis_sessions WHERE status = 'done' LIMIT 1;
```

用瀏覽器訪問 `http://localhost:3000/share/<token>`（**不需要登入**）。

驗證清單：
- [ ] 看到灰色 banner「此為公開分享報告，僅供檢視」
- [ ] 報告正常載入，頁面清單、7 大指標、AI 報告均正確顯示
- [ ] 沒有匯出按鈕、沒有登出按鈕
- [ ] 訪問 `http://localhost:3000/share/invalid-token` 顯示「連結已失效或不存在」
- [ ] 未登入情況下可正常訪問（開無痕視窗測試）

- [ ] **Step 3：Commit**

```bash
git add app/pages/share/
git commit -m "feat(ui): add public share report page /share/[token]"
```

---

## Task 7：結果頁加入「複製分享連結」按鈕

**Files:**
- Modify: `app/pages/analyze/result/[sessionId].vue`

- [ ] **Step 1：在 header 的 export 按鈕群組加入複製按鈕**

找到 `app/pages/analyze/result/[sessionId].vue` header 的按鈕區塊（約第 21-38 行）：

```html
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white bg-white/10 border border-white/25 transition-all hover:bg-white/25 hover:border-white/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="exporting === 'csv'"
            @click="triggerExport('csv')"
          >
```

在這個 `<div class="flex items-center gap-2">` 內，**在 CSV 按鈕之前**插入複製分享連結按鈕：

```html
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-white bg-white/10 border border-white/25 transition-all hover:bg-white/25 hover:border-white/40 active:scale-95"
            @click="copyShareLink"
          >
            <UIcon :name="copyingShare ? 'i-heroicons-check' : 'i-heroicons-link'" class="w-4 h-4" />
            <span>{{ copyingShare ? '已複製！' : '分享連結' }}</span>
          </button>
          <!-- 原有 CSV 按鈕 -->
          <button ...>
```

- [ ] **Step 2：在 `<script setup>` 加入 copyingShare ref 和 copyShareLink function**

在 `app/pages/analyze/result/[sessionId].vue` 的 `<script setup lang="ts">` 區塊中，找到 `const exporting = ref<'csv' | 'markdown' | null>(null)` 那一行，在其後加入：

```ts
const copyingShare = ref(false)

async function copyShareLink() {
  const token = sessionData.value?.share_token
  if (!token || copyingShare.value) return
  const url = `${window.location.origin}/share/${token}`
  await navigator.clipboard.writeText(url)
  copyingShare.value = true
  setTimeout(() => { copyingShare.value = false }, 1500)
}
```

- [ ] **Step 3：瀏覽器驗證**

啟動 dev server，用已有帳號登入，開啟任一分析結果頁。

驗證清單：
- [ ] header 右側看到「分享連結」按鈕（link icon）
- [ ] 點擊後圖示變為 ✓、文字變為「已複製！」
- [ ] 1.5 秒後恢復原狀
- [ ] 開無痕視窗貼上複製到的 URL，確認可正常看到分享報告

- [ ] **Step 4：Commit**

```bash
git add app/pages/analyze/result/
git commit -m "feat(ui): add copy share link button to result page"
```

---

## Self-Review

**Spec coverage check:**
- [x] GitHub Actions CI yml → Task 1
- [x] README badge → Task 1 Step 3
- [x] DB migration (share_token) → Task 2
- [x] `/api/share/[token]` 公開 API → Task 3
- [x] Status endpoint 回傳 share_token → Task 4
- [x] Auth middleware 白名單 → Task 5
- [x] `/share/[token]` 頁面（banner, 報告, 無匯出按鈕, 404 handling） → Task 6
- [x] 結果頁「複製分享連結」按鈕 → Task 7
- [x] 安全性：不洩漏 user_id → Task 3 Step 1 note

**Placeholder scan:** 無 TBD/TODO，所有程式碼完整提供。

**Type consistency:** `sessionData.value?.share_token` 在 Task 4 return、Task 7 `copyShareLink` 中命名一致。API 回傳的 `analyses` 陣列結構在 Task 3 和 Task 6 的 `$fetch` 消費端對齊。
