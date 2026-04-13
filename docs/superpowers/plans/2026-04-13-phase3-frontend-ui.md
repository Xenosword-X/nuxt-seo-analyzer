# nuxt-seo-analyzer — Phase 3: 前端報告 UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作完整的分析報告頁面與歷史紀錄頁面，讓使用者能看到 7 大指標詳情、AI 中文報告，以及瀏覽過去的分析記錄。

**Architecture:** 純前端 UI，資料來源為已有的 `/api/analyze/status/[sessionId]` API。新增一個歷史紀錄 API `/api/history`。報告頁採左側頁面列表 + 右側指標詳情的兩欄布局，AI 報告用 `marked` 套件渲染 Markdown。

**Tech Stack:** Nuxt 3、Vue 3、@nuxt/ui、marked（Markdown 渲染）

---

## 重要架構慣例（必讀）

- 所有頁面在 `app/pages/` 下（Nuxt 4 慣例）
- `server/api/` 不寫 import（Nuxt auto-import）
- `server/utils/` 間用相對路徑 import

---

## 檔案結構

```
server/api/
└── history/
    └── index.get.ts           # 列出目前用戶的所有 session 歷史

app/pages/
├── analyze/
│   └── result/
│       └── [sessionId].vue    # 核心報告頁（兩欄：頁面列表 + 指標詳情）
└── history/
    └── index.vue              # 歷史紀錄列表

app/pages/
└── dashboard.vue              # 修改：加入最近 5 筆歷史紀錄
```

---

## Task 1：歷史紀錄 API

**Files:**
- Create: `server/api/history/index.get.ts`

- [ ] **Step 1：建立 `server/api/history/index.get.ts`**

```ts
// server/api/history/index.get.ts
export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const limit = Number(getQuery(event).limit ?? 20)

  const { data: sessions } = await supabase
    .from('analysis_sessions')
    .select('id, domain, status, page_count, created_at')
    .eq('user_id', user.id)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(limit)

  return { sessions: sessions ?? [] }
})
```

- [ ] **Step 2：Commit**

```bash
cd "C:/Users/User/Documents/GitHub/nuxt-seo-analyzer"
git add server/api/history/index.get.ts
git commit -m "feat: add history list api"
```

---

## Task 2：安裝 marked 套件

**Files:**
- Modify: `package.json`

- [ ] **Step 1：安裝 marked**

```bash
cd "C:/Users/User/Documents/GitHub/nuxt-seo-analyzer"
npm install marked
```

- [ ] **Step 2：確認安裝成功**

```bash
cat package.json | grep marked
```

Expected: `"marked": "^..."` 出現在 dependencies

- [ ] **Step 3：Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add marked for ai report markdown rendering"
```

---

## Task 3：核心報告頁面

**Files:**
- Create: `app/pages/analyze/result/[sessionId].vue`

這是 Phase 3 最核心的頁面。布局為：
- 上方：標題（網域 + 日期）
- 左欄（1/3）：頁面清單，每頁顯示狀態圖示（依 issues 數量決定）
- 右欄（2/3）：選取頁面的 7 大指標卡片 + AI 報告

- [ ] **Step 1：建立 `app/pages/analyze/result/[sessionId].vue`**

```vue
<!-- app/pages/analyze/result/[sessionId].vue -->
<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-6xl mx-auto space-y-5">

      <!-- 標題列 -->
      <header class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
            <UButton
              variant="ghost"
              icon="i-heroicons-arrow-left"
              size="sm"
              @click="navigateTo('/dashboard')"
            />
            <h1 class="text-xl font-bold text-gray-900">{{ sessionData?.domain }}</h1>
          </div>
          <p class="text-sm text-gray-500 ml-10 mt-0.5">
            共 {{ analyses.length }} 頁
          </p>
        </div>
        <UButton variant="ghost" size="sm" @click="navigateTo('/history')">
          查看歷史紀錄
        </UButton>
      </header>

      <!-- 載入中 -->
      <div v-if="pending" class="text-center py-20 text-gray-400">載入中...</div>

      <div v-else class="flex gap-5 items-start">

        <!-- 左欄：頁面清單 -->
        <div class="w-72 flex-shrink-0 space-y-2">
          <p class="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">已分析頁面</p>
          <div
            v-for="(analysis, i) in analyses"
            :key="analysis.id"
            class="cursor-pointer rounded-xl border p-3 transition-colors"
            :class="selectedIndex === i
              ? 'bg-white border-blue-300 shadow-sm'
              : 'bg-white border-gray-100 hover:border-gray-200'"
            @click="selectedIndex = i"
          >
            <div class="flex items-center gap-2">
              <span class="text-base flex-shrink-0">{{ pageStatusIcon(analysis) }}</span>
              <p class="text-xs text-gray-700 truncate font-medium">{{ urlPath(analysis.url) }}</p>
            </div>
            <p class="text-xs text-gray-400 mt-1 ml-6">
              {{ totalIssues(analysis) }} 個問題
            </p>
          </div>
        </div>

        <!-- 右欄：詳細指標 -->
        <div v-if="selected" class="flex-1 space-y-4">

          <!-- Meta Tags -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <span class="font-semibold text-gray-800">📄 Meta 標籤</span>
                <ScoreBar :score="selected.meta_tags?.score ?? 0" />
              </div>
            </template>
            <div class="space-y-2 text-sm">
              <MetaRow label="Title" :value="selected.meta_tags?.title" />
              <MetaRow label="Description" :value="selected.meta_tags?.description" />
              <MetaRow label="Canonical" :value="selected.meta_tags?.canonical" />
              <MetaRow label="og:image" :value="selected.meta_tags?.ogImage" />
              <IssueList :issues="selected.meta_tags?.issues ?? []" />
            </div>
          </UCard>

          <!-- Core Web Vitals -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <span class="font-semibold text-gray-800">⚡ Core Web Vitals</span>
                <ScoreBar :score="selected.core_web_vitals?.speedScore ?? 0" />
              </div>
            </template>
            <div class="grid grid-cols-2 gap-3 text-sm mb-3">
              <CWVItem label="FCP" :value="formatMs(selected.core_web_vitals?.fcp)" />
              <CWVItem label="LCP" :value="formatMs(selected.core_web_vitals?.lcp)" :warn="(selected.core_web_vitals?.lcp ?? 0) > 2500" />
              <CWVItem label="TBT" :value="formatMs(selected.core_web_vitals?.tbt)" />
              <CWVItem label="CLS" :value="selected.core_web_vitals?.cls?.toFixed(3) ?? 'N/A'" :warn="(selected.core_web_vitals?.cls ?? 0) > 0.1" />
            </div>
            <IssueList :issues="selected.core_web_vitals?.issues ?? []" />
          </UCard>

          <!-- 索引狀態 -->
          <UCard>
            <template #header>
              <span class="font-semibold text-gray-800">🔍 Google 索引狀態</span>
            </template>
            <div class="text-sm space-y-1">
              <p>
                <span class="text-gray-500">狀態：</span>
                <span :class="selected.indexing?.isIndexed ? 'text-green-600 font-medium' : 'text-red-500 font-medium'">
                  {{ selected.indexing?.isIndexed ? '✅ 已收錄' : '❌ 未收錄' }}
                </span>
              </p>
              <p v-if="selected.indexing?.resultCount !== null">
                <span class="text-gray-500">收錄數：</span>{{ selected.indexing?.resultCount?.toLocaleString() }} 筆
              </p>
              <p class="text-gray-500 text-xs">引擎：{{ selected.indexing?.engineUsed }}</p>
              <IssueList :issues="selected.indexing?.issues ?? []" />
            </div>
          </UCard>

          <!-- 標題結構 + 內部連結 -->
          <UCard>
            <template #header>
              <span class="font-semibold text-gray-800">🏷️ 標題結構</span>
            </template>
            <div class="text-sm space-y-1">
              <p><span class="text-gray-500">H1：</span>{{ selected.headings?.h1?.join('、') || '（無）' }}</p>
              <p><span class="text-gray-500">H2 數量：</span>{{ selected.headings?.h2Count ?? 0 }}</p>
              <p><span class="text-gray-500">H3 數量：</span>{{ selected.headings?.h3Count ?? 0 }}</p>
              <p><span class="text-gray-500">內部連結：</span>{{ selected.headings?.internalLinkCount ?? 0 }} 個</p>
              <IssueList :issues="selected.headings?.issues ?? []" />
            </div>
          </UCard>

          <!-- 圖片 Alt -->
          <UCard>
            <template #header>
              <span class="font-semibold text-gray-800">🖼️ 圖片 Alt 文字</span>
            </template>
            <div class="text-sm space-y-1">
              <p><span class="text-gray-500">圖片總數：</span>{{ selected.images?.total ?? 0 }}</p>
              <p>
                <span class="text-gray-500">缺少 alt：</span>
                <span :class="(selected.images?.missingAlt ?? 0) > 0 ? 'text-red-500 font-medium' : 'text-green-600'">
                  {{ selected.images?.missingAlt ?? 0 }} 張
                </span>
              </p>
              <div v-if="(selected.images?.missingSrcs?.length ?? 0) > 0" class="mt-2">
                <p class="text-gray-500 mb-1">缺少 alt 的圖片：</p>
                <ul class="space-y-0.5">
                  <li v-for="src in selected.images?.missingSrcs" :key="src" class="text-xs text-gray-600 truncate font-mono bg-gray-50 px-2 py-0.5 rounded">{{ src }}</li>
                </ul>
              </div>
              <IssueList :issues="selected.images?.issues ?? []" />
            </div>
          </UCard>

          <!-- Schema -->
          <UCard>
            <template #header>
              <span class="font-semibold text-gray-800">📋 結構化資料（Schema）</span>
            </template>
            <div class="text-sm space-y-1">
              <p v-if="(selected.schema_data?.types?.length ?? 0) > 0">
                <span class="text-gray-500">偵測到的類型：</span>
                <span v-for="t in selected.schema_data?.types" :key="t"
                  class="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded mr-1">{{ t }}</span>
              </p>
              <p v-else class="text-gray-400">未偵測到 JSON-LD</p>
              <IssueList :issues="selected.schema_data?.issues ?? []" />
            </div>
          </UCard>

          <!-- Robots / Sitemap -->
          <UCard>
            <template #header>
              <span class="font-semibold text-gray-800">🤖 Robots / Sitemap</span>
            </template>
            <div class="text-sm space-y-1">
              <p>
                <span class="text-gray-500">Robots.txt：</span>
                <span :class="selected.robotsSitemap?.robotsAllowed ? 'text-green-600' : 'text-red-500'">
                  {{ selected.robotsSitemap?.robotsAllowed ? '✅ 允許爬取' : '❌ 封鎖爬取' }}
                </span>
              </p>
              <p>
                <span class="text-gray-500">Sitemap.xml：</span>
                <span :class="selected.robotsSitemap?.sitemapExists ? 'text-green-600' : 'text-orange-500'">
                  {{ selected.robotsSitemap?.sitemapExists ? '✅ 存在' : '⚠️ 未找到' }}
                </span>
              </p>
              <IssueList :issues="selected.robotsSitemap?.issues ?? []" />
            </div>
          </UCard>

          <!-- AI 報告 -->
          <UCard>
            <template #header>
              <span class="font-semibold text-gray-800">🤖 AI 中文 SEO 健診報告</span>
            </template>
            <div
              class="prose prose-sm max-w-none text-gray-700"
              v-html="renderedReport"
            />
          </UCard>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'

const route = useRoute()
const sessionId = route.params.sessionId as string

const supabase = useSupabaseClient()
const pending = ref(true)
const sessionData = ref<any>(null)
const analyses = ref<any[]>([])
const selectedIndex = ref(0)

const selected = computed(() => analyses.value[selectedIndex.value] ?? null)

const renderedReport = computed(() => {
  const report = selected.value?.ai_report
  if (!report) return '<p class="text-gray-400">（無報告）</p>'
  return marked(report)
})

async function load() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) { navigateTo('/'); return }

  try {
    const result = await $fetch<any>(`/api/analyze/status/${sessionId}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    sessionData.value = result
    analyses.value = result.analyses ?? []
  } catch {
    navigateTo('/dashboard')
  } finally {
    pending.value = false
  }
}

// 工具函式
function urlPath(url: string) {
  try { return new URL(url).pathname || '/' } catch { return url }
}

function formatDate(ts: string) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatMs(ms: number | null) {
  if (ms === null || ms === undefined) return 'N/A'
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'
}

function totalIssues(analysis: any): number {
  return [
    analysis.meta_tags?.issues,
    analysis.core_web_vitals?.issues,
    analysis.robots_sitemap?.issues,
    analysis.schema_data?.issues,   // snake_case：對應 Supabase 欄位名稱
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

- [ ] **Step 2：建立子元件 `app/components/ScoreBar.vue`**

```vue
<!-- app/components/ScoreBar.vue -->
<template>
  <div class="flex items-center gap-2">
    <div class="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
      <div
        class="h-2 rounded-full transition-all"
        :class="scoreColor"
        :style="{ width: score + '%' }"
      />
    </div>
    <span class="text-sm font-medium" :class="scoreColor.replace('bg-', 'text-')">
      {{ score }}分
    </span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ score: number }>()

const scoreColor = computed(() => {
  if (props.score >= 80) return 'bg-green-500'
  if (props.score >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
})
</script>
```

- [ ] **Step 3：建立子元件 `app/components/IssueList.vue`**

```vue
<!-- app/components/IssueList.vue -->
<template>
  <ul v-if="issues.length > 0" class="mt-2 space-y-1">
    <li
      v-for="issue in issues"
      :key="issue"
      class="flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded"
    >
      <span class="flex-shrink-0 mt-0.5">⚠️</span>
      <span>{{ issue }}</span>
    </li>
  </ul>
  <p v-else class="text-xs text-green-600 mt-1">✅ 無問題</p>
</template>

<script setup lang="ts">
defineProps<{ issues: string[] }>()
</script>
```

- [ ] **Step 4：建立子元件 `app/components/MetaRow.vue`**

```vue
<!-- app/components/MetaRow.vue -->
<template>
  <div class="flex gap-2">
    <span class="text-gray-500 flex-shrink-0 w-24">{{ label }}：</span>
    <span v-if="value" class="text-gray-800 break-all">{{ value }}</span>
    <span v-else class="text-red-400">（未設定）</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value?: string | null }>()
</script>
```

- [ ] **Step 5：建立子元件 `app/components/CWVItem.vue`**

```vue
<!-- app/components/CWVItem.vue -->
<template>
  <div class="bg-gray-50 rounded-lg p-3">
    <p class="text-xs text-gray-500 mb-1">{{ label }}</p>
    <p class="font-semibold" :class="warn ? 'text-red-500' : 'text-gray-800'">{{ value }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string; warn?: boolean }>()
</script>
```

- [ ] **Step 6：確認 `app/pages/analyze/result/` 目錄存在，然後 Commit**

```bash
cd "C:/Users/User/Documents/GitHub/nuxt-seo-analyzer"
git add app/pages/analyze/result/ app/components/
git commit -m "feat: add result page with 7-metric layout and AI report"
```

---

## Task 4：歷史紀錄頁面

**Files:**
- Create: `app/pages/history/index.vue`

- [ ] **Step 1：建立 `app/pages/history/index.vue`**

```vue
<!-- app/pages/history/index.vue -->
<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-3xl mx-auto space-y-6">

      <header class="flex items-center gap-4">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" size="sm" @click="navigateTo('/dashboard')" />
        <h1 class="text-xl font-bold text-gray-900">分析歷史紀錄</h1>
      </header>

      <UCard>
        <!-- 載入中 -->
        <div v-if="pending" class="text-center py-10 text-gray-400">載入中...</div>

        <!-- 無資料 -->
        <div v-else-if="sessions.length === 0" class="text-center py-10 text-gray-400">
          尚無分析紀錄
        </div>

        <!-- 清單 -->
        <div v-else class="divide-y">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="flex items-center justify-between py-4 hover:bg-gray-50 px-2 rounded-lg cursor-pointer transition-colors"
            @click="navigateTo(`/analyze/result/${session.id}`)"
          >
            <div class="space-y-1">
              <p class="font-medium text-gray-900">{{ session.domain }}</p>
              <p class="text-sm text-gray-500">
                {{ formatDate(session.created_at) }} ｜ {{ session.page_count }} 頁
              </p>
            </div>
            <div class="flex items-center gap-3">
              <UBadge color="green" variant="soft">已完成</UBadge>
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400" />
            </div>
          </div>
        </div>
      </UCard>

    </div>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const pending = ref(true)
const sessions = ref<any[]>([])

async function load() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) { navigateTo('/'); return }

  try {
    const result = await $fetch<{ sessions: any[] }>('/api/history', {
      headers: { authorization: `Bearer ${token}` },
    })
    sessions.value = result.sessions
  } catch {
    sessions.value = []
  } finally {
    pending.value = false
  }
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

onMounted(load)
</script>
```

- [ ] **Step 2：Commit**

```bash
git add app/pages/history/index.vue
git commit -m "feat: add history page"
```

---

## Task 5：更新 Dashboard 顯示最近歷史

**Files:**
- Modify: `app/pages/dashboard.vue`

讀取目前的 `app/pages/dashboard.vue`，找到「最近分析紀錄」的佔位區塊：

```vue
<!-- 歷史紀錄（Phase 3 實作） -->
<UCard>
  <template #header>
    <h2 class="font-semibold text-gray-800">最近分析紀錄</h2>
  </template>
  <p class="text-gray-400 text-sm">（歷史紀錄功能將在 Phase 3 加入）</p>
</UCard>
```

替換為：

```vue
<!-- 最近分析紀錄 -->
<UCard>
  <template #header>
    <div class="flex items-center justify-between">
      <h2 class="font-semibold text-gray-800">最近分析紀錄</h2>
      <UButton variant="ghost" size="xs" @click="navigateTo('/history')">查看全部</UButton>
    </div>
  </template>

  <div v-if="recentSessions.length === 0" class="text-gray-400 text-sm py-2">
    尚無分析紀錄
  </div>

  <div v-else class="divide-y">
    <div
      v-for="session in recentSessions"
      :key="session.id"
      class="flex items-center justify-between py-3 cursor-pointer hover:bg-gray-50 rounded-lg px-2 transition-colors"
      @click="navigateTo(`/analyze/result/${session.id}`)"
    >
      <div>
        <p class="text-sm font-medium text-gray-800">{{ session.domain }}</p>
        <p class="text-xs text-gray-400">{{ formatDate(session.created_at) }} ｜ {{ session.page_count }} 頁</p>
      </div>
      <UIcon name="i-heroicons-chevron-right" class="text-gray-300" />
    </div>
  </div>
</UCard>
```

同時在 `<script setup>` 中加入：

```ts
const recentSessions = ref<any[]>([])

function formatDate(ts: string) {
  return new Date(ts).toLocaleString('zh-TW', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

async function loadRecentSessions() {
  const token = await getToken()
  if (!token) return
  try {
    const result = await $fetch<{ sessions: any[] }>('/api/history?limit=5', {
      headers: { authorization: `Bearer ${token}` },
    })
    recentSessions.value = result.sessions
  } catch {}
}
```

並在 `onMounted` 中加入 `loadRecentSessions()`：

```ts
onMounted(() => {
  loadUsage()
  loadRecentSessions()
})
```

- [ ] **Step 1：讀取並修改 `app/pages/dashboard.vue`（依上方說明）**

- [ ] **Step 2：確認 `npx vitest run` 仍全數通過**

```bash
npx vitest run 2>&1
```

Expected: 42 tests passed

- [ ] **Step 3：Commit**

```bash
git add app/pages/dashboard.vue
git commit -m "feat: add recent sessions list to dashboard"
```

---

## 完成確認清單

Phase 3 完成後，以下所有流程應可正常運作：

- [ ] 分析完成後點「查看完整報告」→ 正確顯示報告頁面（不再 404）
- [ ] 左側頁面列表顯示狀態圖示（✅ ⚠️ ❌）
- [ ] 點擊頁面切換右側詳細指標
- [ ] AI 中文報告正確渲染 Markdown（有標題、條列）
- [ ] ScoreBar 依分數顯示不同顏色（綠/黃/紅）
- [ ] `/history` 頁面顯示歷史清單，可點擊進入報告
- [ ] Dashboard 顯示最近 5 筆歷史，可點擊進入報告
- [ ] `npx vitest run` — 42 tests 全數通過
