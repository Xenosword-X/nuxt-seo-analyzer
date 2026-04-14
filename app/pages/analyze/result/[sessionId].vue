<!-- app/pages/analyze/result/[sessionId].vue -->
<template>
  <div class="min-h-screen" style="background: linear-gradient(135deg, #f8fafc 0%, #f0f9ff 55%, #ecfeff 100%)">

    <!-- Top nav bar -->
    <header style="background: linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%); box-shadow: 0 4px 20px rgba(3,105,161,0.28)">
      <div class="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button
            class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/20 text-white"
            @click="navigateTo('/dashboard')"
          >
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          </button>
          <div>
            <h1 class="text-white font-bold text-base leading-tight">{{ sessionData?.domain }}</h1>
            <p class="text-white/60 text-xs">共 {{ analyses.length }} 頁分析結果</p>
          </div>
        </div>
        <button class="text-white/70 hover:text-white text-sm transition-colors" @click="navigateTo('/history')">
          歷史紀錄 →
        </button>
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
  return marked(report) as string
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

function urlPath(url: string) {
  try { return new URL(url).pathname || '/' } catch { return url }
}

function formatMs(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return 'N/A'
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'
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
