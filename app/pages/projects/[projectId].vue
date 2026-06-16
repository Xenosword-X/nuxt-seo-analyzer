<template>
  <div class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 lg:px-8">
        <UButton
          class="w-fit"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-left"
          @click="navigateTo('/dashboard')"
        >
          返回儀表板
        </UButton>

        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-500">SEO 專案</p>
            <h1 class="mt-1 truncate text-2xl font-bold text-slate-950 sm:text-3xl">
              {{ project?.name || '讀取專案中' }}
            </h1>
            <p class="mt-2 truncate text-sm text-slate-500">
              {{ project?.domain || '正在載入網域資料' }}
            </p>
          </div>

          <span
            class="inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
            :class="scoreBadgeClass(project?.healthScore ?? 0)"
          >
            <UIcon name="i-heroicons-heart" class="h-4 w-4" />
            健康分數 {{ project?.healthScore ?? '--' }}
          </span>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <div v-if="loading" class="flex items-center justify-center rounded-lg border border-slate-200 bg-white py-20 text-sm text-slate-500 shadow-sm">
        <UIcon name="i-heroicons-arrow-path" class="mr-2 h-5 w-5 animate-spin" />
        正在讀取專案資料...
      </div>

      <div v-else-if="loadError" class="rounded-lg border border-rose-200 bg-white px-5 py-14 text-center shadow-sm">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-rose-50">
          <UIcon name="i-heroicons-exclamation-circle" class="h-6 w-6 text-rose-600" />
        </div>
        <h2 class="mt-4 text-base font-semibold text-slate-950">專案讀取失敗</h2>
        <p class="mt-2 text-sm text-slate-500">{{ loadError }}</p>
        <UButton class="mt-5" color="neutral" variant="soft" icon="i-heroicons-arrow-path" @click="loadProject">
          重新讀取
        </UButton>
      </div>

      <div v-else-if="project" class="space-y-8">
        <section class="grid gap-4 md:grid-cols-4">
          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-medium text-slate-500">健康分數</p>
            <p class="mt-3 text-3xl font-bold" :class="scoreTextClass(project.healthScore)">
              {{ project.healthScore }}
            </p>
            <div class="mt-3 h-2 rounded-full bg-slate-100">
              <div
                class="h-2 rounded-full transition-all"
                :class="scoreBarClass(project.healthScore)"
                :style="{ width: `${clampScore(project.healthScore)}%` }"
              />
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-medium text-slate-500">待處理任務</p>
            <p class="mt-3 text-3xl font-bold text-slate-950">{{ openTaskCount }}</p>
            <p class="mt-1 text-sm text-slate-500">狀態為 open 的任務</p>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-medium text-slate-500">競爭對手</p>
            <p class="mt-3 text-3xl font-bold text-slate-950">{{ project.competitors.length }}</p>
            <p class="mt-1 truncate text-sm text-slate-500">{{ competitorSummary }}</p>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p class="text-sm font-medium text-slate-500">最近稽核</p>
            <p class="mt-3 text-2xl font-bold text-slate-950">{{ recentAuditDate }}</p>
            <p class="mt-1 text-sm text-slate-500">最近一次分析紀錄</p>
          </div>
        </section>

        <section class="grid gap-6 xl:grid-cols-3">
          <div
            v-for="section in providerSections"
            :key="section.provider"
            class="rounded-lg border border-slate-200 bg-white shadow-sm"
          >
            <div class="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 class="text-lg font-semibold text-slate-950">{{ section.title }}</h2>
                <p class="mt-1 text-sm text-slate-500">{{ section.subtitle }}</p>
              </div>
              <span
                class="rounded-full border px-2.5 py-1 text-xs font-medium"
                :class="providerStatusClass(section.snapshot?.status)"
              >
                {{ providerStatusLabel(section.snapshot?.status) }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-3 p-5">
              <div
                v-for="metric in section.metrics"
                :key="`${section.provider}-${metric.key}`"
                class="rounded-lg bg-slate-50 p-4"
              >
                <p class="text-xs font-medium text-slate-500">{{ metric.label }}</p>
                <p class="mt-2 text-xl font-bold text-slate-950">{{ metric.value }}</p>
              </div>
            </div>

            <div class="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span v-if="section.snapshot">
                {{ modeLabel(section.snapshot.mode) }}，更新於 {{ formatDateTime(section.snapshot.fetched_at) }}
              </span>
              <span v-else>尚無資料</span>
            </div>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-950">SEO 任務清單</h2>
              <p class="text-sm text-slate-500">依影響程度與執行成本追蹤修復進度</p>
            </div>
            <span class="text-sm font-medium text-slate-500">共 {{ tasks.length }} 項</span>
          </div>

          <div v-if="tasks.length === 0" class="px-5 py-14 text-center text-sm text-slate-500">
            目前沒有任務。
          </div>

          <div v-else class="divide-y divide-slate-100">
            <article
              v-for="task in tasks"
              :key="task.id"
              class="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center"
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-base font-semibold text-slate-950">{{ task.title }}</h3>
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="impactClass(task.impact)">
                    影響 {{ impactLabel(task.impact) }}
                  </span>
                  <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="effortClass(task.effort)">
                    成本 {{ effortLabel(task.effort) }}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 text-slate-600">{{ task.description }}</p>
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-xs font-medium text-slate-500" :for="`task-status-${task.id}`">
                  任務狀態
                </label>
                <select
                  :id="`task-status-${task.id}`"
                  class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  :value="task.status"
                  :disabled="updatingTaskId === task.id"
                  @change="handleTaskStatusChange(task, $event)"
                >
                  <option value="open">待處理</option>
                  <option value="done">已完成</option>
                  <option value="ignored">已忽略</option>
                </select>
                <p v-if="taskUpdateError[task.id]" class="text-xs text-rose-600">
                  {{ taskUpdateError[task.id] }}
                </p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
type ProviderName = 'ahrefs' | 'gsc' | 'crawler'
type ProviderMode = 'demo' | 'live' | 'imported'
type ProviderStatus = 'ready' | 'failed' | 'partial'
type TaskImpact = 'high' | 'medium' | 'low'
type TaskEffort = 'high' | 'medium' | 'low'
type TaskStatus = 'open' | 'done' | 'ignored'

interface ProviderSummary {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: Record<string, unknown>
  error: string | null
}

interface ProjectDetail {
  id: string
  name: string
  domain: string
  target_market: string | null
  competitors: string[]
  created_at: string
  updated_at: string
  healthScore: number
}

interface ProjectTask {
  id: string
  project_id: string
  source: string
  title: string
  description: string
  impact: TaskImpact
  effort: TaskEffort
  status: TaskStatus
  created_at: string
}

interface RecentSession {
  id: string
  domain: string
  status: string
  page_count: number | null
  created_at: string
  site_pages_indexed: number | null
  site_images_indexed: number | null
  site_indexing_engine: string | null
}

interface ProjectDetailResponse {
  project: ProjectDetail
  providers: ProviderSummary[]
  tasks: ProjectTask[]
  recentSessions: RecentSession[]
}

interface TaskUpdateResponse {
  task: ProjectTask
}

interface ProviderMetric {
  key: string
  label: string
  value: string
}

interface ProviderSection {
  provider: ProviderName
  title: string
  subtitle: string
  snapshot: ProviderSummary | null
  metrics: ProviderMetric[]
}

const route = useRoute()
const supabase = useSupabaseClient()

const project = ref<ProjectDetail | null>(null)
const providers = ref<ProviderSummary[]>([])
const tasks = ref<ProjectTask[]>([])
const recentSessions = ref<RecentSession[]>([])
const loading = ref(true)
const loadError = ref('')
const updatingTaskId = ref<string | null>(null)
const taskUpdateError = reactive<Record<string, string>>({})

const projectId = computed(() => {
  const value = route.params.projectId
  return Array.isArray(value) ? value[0] : value
})

const openTaskCount = computed(() => tasks.value.filter((task) => task.status === 'open').length)

const competitorSummary = computed(() => {
  if (!project.value?.competitors.length) return '尚未設定競爭對手'
  return project.value.competitors.join('、')
})

const recentAuditDate = computed(() => {
  const latest = recentSessions.value[0]
  return latest ? formatDate(latest.created_at) : '尚未執行'
})

const providerSections = computed<ProviderSection[]>(() => [
  {
    provider: 'ahrefs',
    title: 'Ahrefs 權重與外鏈',
    subtitle: '網域權重、反向連結與關鍵字規模',
    snapshot: providerByName('ahrefs'),
    metrics: [
      metric('domainRating', 'Domain Rating', providerByName('ahrefs')),
      metric('backlinks', 'Backlinks', providerByName('ahrefs')),
      metric('referringDomains', 'Referring Domains', providerByName('ahrefs')),
      metric('organicKeywords', 'Organic Keywords', providerByName('ahrefs')),
    ],
  },
  {
    provider: 'gsc',
    title: 'Google Search Console',
    subtitle: '搜尋曝光、點擊與平均排名',
    snapshot: providerByName('gsc'),
    metrics: [
      metric('clicks', 'Clicks', providerByName('gsc')),
      metric('impressions', 'Impressions', providerByName('gsc')),
      metric('ctr', 'CTR', providerByName('gsc'), 'percent'),
      metric('averagePosition', 'Average Position', providerByName('gsc'), 'decimal'),
    ],
  },
  {
    provider: 'crawler',
    title: 'Crawler 技術稽核',
    subtitle: '站內抓取、錯誤連結與中繼資料缺口',
    snapshot: providerByName('crawler'),
    metrics: [
      metric('crawledUrls', 'Crawled URLs', providerByName('crawler')),
      metric('brokenLinks', 'Broken Links', providerByName('crawler')),
      metric('missingDescriptions', 'Missing Descriptions', providerByName('crawler')),
      metric('redirectChains', 'Redirect Chains', providerByName('crawler')),
    ],
  },
])

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function loadProject() {
  loading.value = true
  loadError.value = ''

  const token = await getToken()
  if (!token) {
    await navigateTo('/')
    return
  }

  try {
    const data = await $fetch<ProjectDetailResponse>(`/api/projects/${projectId.value}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    project.value = data.project
    providers.value = data.providers
    tasks.value = data.tasks
    recentSessions.value = data.recentSessions
  } catch (error: any) {
    loadError.value = error?.data?.message || error?.message || '讀取專案失敗'
    project.value = null
    providers.value = []
    tasks.value = []
    recentSessions.value = []
  } finally {
    loading.value = false
  }
}

async function updateTaskStatus(task: ProjectTask, status: TaskStatus) {
  if (task.status === status || updatingTaskId.value) return

  const previousStatus = task.status
  updatingTaskId.value = task.id
  taskUpdateError[task.id] = ''

  const taskIndex = tasks.value.findIndex((item) => item.id === task.id)
  if (taskIndex !== -1) {
    tasks.value[taskIndex] = { ...tasks.value[taskIndex], status }
  }

  try {
    const token = await getToken()
    if (!token) {
      await navigateTo('/')
      return
    }

    const data = await $fetch<TaskUpdateResponse>(`/api/projects/${projectId.value}/tasks/${task.id}`, {
      method: 'PATCH',
      body: { status },
      headers: { authorization: `Bearer ${token}` },
    })

    if (taskIndex !== -1) {
      tasks.value[taskIndex] = data.task
    }
  } catch (error: any) {
    if (taskIndex !== -1) {
      tasks.value[taskIndex] = { ...tasks.value[taskIndex], status: previousStatus }
    }
    taskUpdateError[task.id] = error?.data?.message || error?.message || '更新狀態失敗'
  } finally {
    updatingTaskId.value = null
  }
}

function handleTaskStatusChange(task: ProjectTask, event: Event) {
  const target = event.target as HTMLSelectElement
  const status = target.value
  if (isTaskStatus(status)) {
    updateTaskStatus(task, status)
  }
}

function providerByName(provider: ProviderName): ProviderSummary | null {
  return providers.value.find((item) => item.provider === provider) ?? null
}

function metric(key: string, label: string, snapshot: ProviderSummary | null, format: 'integer' | 'percent' | 'decimal' = 'integer'): ProviderMetric {
  return {
    key,
    label,
    value: formatMetricValue(snapshot?.data?.[key], format),
  }
}

function formatMetricValue(value: unknown, format: 'integer' | 'percent' | 'decimal') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`
  if (format === 'decimal') return value.toFixed(1)
  return new Intl.NumberFormat('zh-TW').format(Math.round(value))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function isTaskStatus(value: string): value is TaskStatus {
  return value === 'open' || value === 'done' || value === 'ignored'
}

function clampScore(score: number) {
  return Math.min(100, Math.max(0, Math.round(score)))
}

function scoreTextClass(score: number) {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

function scoreBarClass(score: number) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-rose-500'
}

function scoreBadgeClass(score: number) {
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

function providerStatusClass(status: ProviderStatus | undefined) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

function providerStatusLabel(status: ProviderStatus | undefined) {
  if (status === 'ready') return '可用'
  if (status === 'partial') return '部分資料'
  if (status === 'failed') return '失敗'
  return '尚無資料'
}

function modeLabel(mode: ProviderMode) {
  const labels: Record<ProviderMode, string> = {
    demo: 'Demo',
    live: 'Live',
    imported: '匯入',
  }
  return labels[mode]
}

function impactClass(impact: TaskImpact) {
  if (impact === 'high') return 'bg-rose-50 text-rose-700'
  if (impact === 'medium') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

function effortClass(effort: TaskEffort) {
  if (effort === 'high') return 'bg-violet-50 text-violet-700'
  if (effort === 'medium') return 'bg-sky-50 text-sky-700'
  return 'bg-emerald-50 text-emerald-700'
}

function impactLabel(impact: TaskImpact) {
  const labels: Record<TaskImpact, string> = {
    high: '高',
    medium: '中',
    low: '低',
  }
  return labels[impact]
}

function effortLabel(effort: TaskEffort) {
  const labels: Record<TaskEffort, string> = {
    high: '高',
    medium: '中',
    low: '低',
  }
  return labels[effort]
}

onMounted(() => {
  loadProject()
})
</script>
