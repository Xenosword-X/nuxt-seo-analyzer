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
    domain.value = res.domain
    pageCount.value = res.page_count
    if (siteIndexing.value === null && res.site_indexing_engine !== null) {
      siteIndexing.value = {
        pagesIndexed: res.site_pages_indexed,
        imagesIndexed: res.site_images_indexed,
        engine: res.site_indexing_engine,
        cached: res.site_indexing_cached,
      }
    }
    // 依 analyses 更新狀態
    const analysesByUrl: Record<string, any> = {}
    for (const a of (res.analyses || [])) analysesByUrl[a.url] = a
    if (pages.value.length === 0 && pageCount.value > 0) {
      pages.value = Object.keys(analysesByUrl).map((u) => ({
        url: u, status: 'done', issueCount: totalIssues(analysesByUrl[u]),
      }))
    }
    if (res.ai_report) aiReport.value = res.ai_report
    if (res.status === 'done') {
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
