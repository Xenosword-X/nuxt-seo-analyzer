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
              <p v-if="selected.indexing?.resultCount !== null && selected.indexing?.resultCount !== undefined">
                <span class="text-gray-500">收錄數：</span>{{ selected.indexing?.resultCount?.toLocaleString() }} 筆
              </p>
              <p class="text-gray-500 text-xs">引擎：{{ selected.indexing?.engineUsed }}</p>
              <IssueList :issues="selected.indexing?.issues ?? []" />
            </div>
          </UCard>

          <!-- 標題結構 -->
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
                  <li
                    v-for="src in selected.images?.missingSrcs"
                    :key="src"
                    class="text-xs text-gray-600 truncate font-mono bg-gray-50 px-2 py-0.5 rounded"
                  >{{ src }}</li>
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
                <span
                  v-for="t in selected.schema_data?.types"
                  :key="t"
                  class="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded mr-1"
                >{{ t }}</span>
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
                <span :class="selected.robots_sitemap?.robotsAllowed ? 'text-green-600' : 'text-red-500'">
                  {{ selected.robots_sitemap?.robotsAllowed ? '✅ 允許爬取' : '❌ 封鎖爬取' }}
                </span>
              </p>
              <p>
                <span class="text-gray-500">Sitemap.xml：</span>
                <span :class="selected.robots_sitemap?.sitemapExists ? 'text-green-600' : 'text-orange-500'">
                  {{ selected.robots_sitemap?.sitemapExists ? '✅ 存在' : '⚠️ 未找到' }}
                </span>
              </p>
              <IssueList :issues="selected.robots_sitemap?.issues ?? []" />
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
