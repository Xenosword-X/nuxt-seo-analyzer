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

      <UCard v-if="discoverData">
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-semibold">
              共找到 {{ discoverData.total }} 個頁面
            </span>
            <div class="flex gap-2 items-center">
              <UButton variant="ghost" size="sm" @click="selectAll">全選</UButton>
              <UButton variant="ghost" size="sm" @click="clearAll">清除</UButton>
              <span class="text-sm text-gray-500">
                已選 {{ selected.size }} / {{ maxSelect }}
              </span>
            </div>
          </div>
        </template>

        <div class="divide-y max-h-[500px] overflow-y-auto">
          <label
            v-for="page in discoverData.pages"
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

      <UCard v-else>
        <p class="text-red-500 text-sm">無法讀取頁面資料，請返回重試。</p>
      </UCard>

    </div>
  </div>
</template>

<script setup lang="ts">
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
  const next = new Set(selected.value)
  if (next.has(url)) {
    next.delete(url)
  } else if (next.size < maxSelect.value) {
    next.add(url)
  }
  selected.value = next
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
  console.log('選取的頁面：', [...selected.value])
  alert(`Phase 2 待實作：將分析 ${selected.value.size} 個頁面`)
}
</script>
