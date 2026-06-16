<template>
  <div class="min-h-screen bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600">
            <UIcon name="i-heroicons-chart-bar-square" class="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 class="text-xl font-bold text-slate-950">Hybrid SEO 專案儀表板</h1>
            <p class="text-sm text-slate-500">管理專案、追蹤任務，並保留快速單次檢測流程。</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
            今日額度
            <span :class="remaining === 0 ? 'text-rose-600' : 'text-emerald-600'">
              {{ remaining }}/{{ limit }}
            </span>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-heroicons-arrow-right-on-rectangle"
            @click="signOut"
          >
            登出
          </UButton>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <section class="grid gap-4 md:grid-cols-3">
        <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-500">專案數</p>
            <UIcon name="i-heroicons-folder" class="h-5 w-5 text-sky-600" />
          </div>
          <p class="mt-3 text-3xl font-bold text-slate-950">{{ projects.length }}</p>
          <p class="mt-1 text-sm text-slate-500">已建立的 SEO 追蹤專案</p>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-500">待處理任務</p>
            <UIcon name="i-heroicons-list-bullet" class="h-5 w-5 text-amber-600" />
          </div>
          <p class="mt-3 text-3xl font-bold text-slate-950">{{ totalOpenTasks }}</p>
          <p class="mt-1 text-sm text-slate-500">所有專案目前 open 任務總數</p>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-500">Hybrid 資料來源</p>
            <UIcon name="i-heroicons-circle-stack" class="h-5 w-5 text-emerald-600" />
          </div>
          <p class="mt-3 text-2xl font-bold text-slate-950">{{ hybridSourceSummary }}</p>
          <p class="mt-1 text-sm text-slate-500">Ahrefs、GSC、Crawler 的整合狀態</p>
        </div>
      </section>

      <section class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div class="space-y-6">
          <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div class="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-slate-950">SEO 專案總覽</h2>
                <p class="text-sm text-slate-500">點選專案列可進入專案細節頁。</p>
              </div>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-heroicons-arrow-path"
                :loading="projectsPending"
                @click="loadProjects"
              >
                重新整理
              </UButton>
            </div>

            <div v-if="projectsPending" class="flex items-center justify-center py-16 text-sm text-slate-500">
              <UIcon name="i-heroicons-arrow-path" class="mr-2 h-5 w-5 animate-spin" />
              載入專案中...
            </div>

            <div v-else-if="projectListError" class="px-5 py-14 text-center">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-rose-50">
                <UIcon name="i-heroicons-exclamation-circle" class="h-6 w-6 text-rose-600" />
              </div>
              <h3 class="mt-4 text-base font-semibold text-slate-950">專案載入失敗</h3>
              <p class="mt-2 text-sm text-slate-500">{{ projectListError }}</p>
              <UButton
                class="mt-5"
                color="neutral"
                variant="soft"
                icon="i-heroicons-arrow-path"
                :loading="projectsPending"
                @click="loadProjects"
              >
                重試
              </UButton>
            </div>

            <div v-else-if="projects.length === 0" class="px-5 py-14 text-center">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-sky-50">
                <UIcon name="i-heroicons-folder-plus" class="h-6 w-6 text-sky-600" />
              </div>
              <h3 class="mt-4 text-base font-semibold text-slate-950">尚未建立專案</h3>
              <p class="mt-2 text-sm text-slate-500">先建立第一個 SEO 專案，系統會自動建立 demo provider 快照與初始任務。</p>
            </div>

            <div v-else class="divide-y divide-slate-100">
              <button
                v-for="project in projects"
                :key="project.id"
                type="button"
                class="group grid w-full gap-4 px-5 py-5 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_160px_110px_24px] md:items-center"
                @click="navigateTo(`/projects/${project.id}`)"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="truncate text-base font-semibold text-slate-950">{{ project.name }}</h3>
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {{ project.target_market || '未設定市場' }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-sm text-slate-500">{{ project.domain }}</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span
                      v-for="provider in project.providers"
                      :key="`${project.id}-${provider.provider}`"
                      class="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium"
                      :class="providerBadgeClass(provider.status)"
                    >
                      <span class="h-1.5 w-1.5 rounded-full" :class="providerDotClass(provider.status)" />
                      {{ providerLabel(provider.provider) }} · {{ modeLabel(provider.mode) }}
                    </span>
                    <span v-if="project.providers.length === 0" class="text-xs text-slate-400">尚無 provider 快照</span>
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between text-sm">
                    <span class="font-medium text-slate-600">健康分數</span>
                    <span class="font-semibold" :class="scoreTextClass(project.healthScore)">
                      {{ project.healthScore }}
                    </span>
                  </div>
                  <div class="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      class="h-2 rounded-full transition-all"
                      :class="scoreBarClass(project.healthScore)"
                      :style="{ width: `${clampScore(project.healthScore)}%` }"
                    />
                  </div>
                </div>

                <div class="rounded-lg bg-slate-50 px-3 py-2 text-center">
                  <p class="text-2xl font-bold text-slate-950">{{ project.openTaskCount }}</p>
                  <p class="text-xs font-medium text-slate-500">open 任務</p>
                </div>

                <UIcon name="i-heroicons-chevron-right" class="hidden h-5 w-5 text-slate-300 transition group-hover:text-sky-600 md:block" />
              </button>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-plus-circle" class="h-5 w-5 text-sky-600" />
              <h2 class="text-lg font-semibold text-slate-950">建立 SEO 專案</h2>
            </div>

            <form class="mt-5 space-y-4" @submit.prevent="createProject">
              <label class="block">
                <span class="text-sm font-medium text-slate-700">專案名稱</span>
                <UInput
                  v-model="projectForm.name"
                  class="mt-1 w-full"
                  placeholder="例如：品牌官網 SEO"
                  :disabled="creatingProject"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium text-slate-700">主要網域</span>
                <UInput
                  v-model="projectForm.domain"
                  class="mt-1 w-full"
                  placeholder="example.com"
                  :disabled="creatingProject"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium text-slate-700">目標市場</span>
                <UInput
                  v-model="projectForm.targetMarket"
                  class="mt-1 w-full"
                  placeholder="台灣 / zh-TW"
                  :disabled="creatingProject"
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium text-slate-700">競品網域</span>
                <textarea
                  v-model="competitorsText"
                  class="mt-1 min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="每行一個，或用逗號分隔"
                  :disabled="creatingProject"
                />
              </label>

              <p v-if="createErrorMsg" class="flex items-start gap-1.5 text-sm text-rose-600">
                <UIcon name="i-heroicons-exclamation-circle" class="mt-0.5 h-4 w-4 shrink-0" />
                {{ createErrorMsg }}
              </p>

              <UButton
                type="submit"
                color="primary"
                block
                icon="i-heroicons-plus"
                :loading="creatingProject"
                :disabled="!canCreateProject"
              >
                建立專案
              </UButton>
            </form>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-magnifying-glass-circle" class="h-5 w-5 text-emerald-600" />
                <h2 class="text-lg font-semibold text-slate-950">快速單次檢測</h2>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-heroicons-clock"
                @click="navigateTo('/history')"
              >
                查看歷史紀錄
              </UButton>
            </div>
            <p class="mt-2 text-sm text-slate-500">
              不建立專案，直接使用現有 discover 流程掃描網站。
            </p>

            <div class="mt-5 space-y-3">
              <UInput
                v-model="quickAuditDomain"
                placeholder="example.com"
                :disabled="remaining === 0 || quickAuditLoading"
                @keyup.enter="startDiscover"
              />

              <UButton
                color="primary"
                variant="solid"
                block
                icon="i-heroicons-bolt"
                :loading="quickAuditLoading"
                :disabled="remaining === 0 || !quickAuditDomain.trim()"
                @click="startDiscover"
              >
                開始快速檢測
              </UButton>
            </div>

            <p v-if="remaining === 0" class="mt-3 flex items-start gap-1.5 text-sm text-rose-600">
              <UIcon name="i-heroicons-exclamation-circle" class="mt-0.5 h-4 w-4 shrink-0" />
              今日使用額度已用完，請明天再試。
            </p>
            <p v-if="quickAuditError" class="mt-3 flex items-start gap-1.5 text-sm text-rose-600">
              <UIcon name="i-heroicons-exclamation-circle" class="mt-0.5 h-4 w-4 shrink-0" />
              {{ quickAuditError }}
            </p>
          </div>
        </aside>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
type ProviderName = 'ahrefs' | 'gsc' | 'crawler'
type ProviderMode = 'demo' | 'live' | 'imported'
type ProviderStatus = 'ready' | 'failed' | 'partial'

interface ProviderSummary {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: Record<string, unknown>
  error: string | null
}

interface ProjectSummary {
  id: string
  name: string
  domain: string
  target_market: string | null
  competitors: string[]
  updated_at: string
  healthScore: number
  openTaskCount: number
  providers: ProviderSummary[]
}

interface ProjectsResponse {
  projects: ProjectSummary[]
}

interface CreateProjectResponse {
  project: {
    id: string
  }
}

const supabase = useSupabaseClient()

const used = ref(0)
const limit = ref(5)
const remaining = computed(() => Math.max(0, limit.value - used.value))

const projects = ref<ProjectSummary[]>([])
const projectsPending = ref(true)
const projectListError = ref('')
const createErrorMsg = ref('')
const creatingProject = ref(false)

const projectForm = reactive({
  name: '',
  domain: '',
  targetMarket: '',
})
const competitorsText = ref('')

const quickAuditDomain = ref('')
const quickAuditLoading = ref(false)
const quickAuditError = ref('')

const totalOpenTasks = computed(() => projects.value.reduce((sum, project) => sum + project.openTaskCount, 0))

const hybridSourceSummary = computed(() => {
  const modes = new Set(projects.value.flatMap((project) => project.providers.map((provider) => provider.mode)))
  if (modes.size === 0) return '尚未連接'
  return [...modes].map(modeLabel).join(' / ')
})

const canCreateProject = computed(() => (
  Boolean(projectForm.name.trim())
  && Boolean(projectForm.domain.trim())
  && !creatingProject.value
))

function parseCompetitors(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function loadUsage() {
  const token = await getToken()
  if (!token) {
    await navigateTo('/')
    return
  }

  try {
    const data = await $fetch<{ used: number; limit: number }>('/api/usage/check', {
      headers: { authorization: `Bearer ${token}` },
    })
    used.value = data.used
    limit.value = data.limit
  } catch {
    used.value = 0
  }
}

async function loadProjects() {
  projectsPending.value = true
  projectListError.value = ''

  const token = await getToken()
  if (!token) {
    await navigateTo('/')
    return
  }

  try {
    const data = await $fetch<ProjectsResponse>('/api/projects', {
      headers: { authorization: `Bearer ${token}` },
    })
    projects.value = data.projects
  } catch (error: any) {
    projectListError.value = error?.data?.message || error?.message || '讀取專案失敗'
    projects.value = []
  } finally {
    projectsPending.value = false
  }
}

async function createProject() {
  if (!canCreateProject.value) return

  creatingProject.value = true
  createErrorMsg.value = ''

  try {
    const token = await getToken()
    if (!token) {
      await navigateTo('/')
      return
    }

    const result = await $fetch<CreateProjectResponse>('/api/projects', {
      method: 'POST',
      body: {
        name: projectForm.name.trim(),
        domain: projectForm.domain.trim(),
        targetMarket: projectForm.targetMarket.trim(),
        competitors: parseCompetitors(competitorsText.value),
      },
      headers: { authorization: `Bearer ${token}` },
    })

    await navigateTo(`/projects/${result.project.id}`)
  } catch (error: any) {
    createErrorMsg.value = error?.data?.message || error?.message || '建立專案失敗'
  } finally {
    creatingProject.value = false
  }
}

async function startDiscover() {
  if (!quickAuditDomain.value.trim() || quickAuditLoading.value) return
  quickAuditLoading.value = true
  quickAuditError.value = ''

  try {
    const token = await getToken()
    if (!token) {
      await navigateTo('/')
      return
    }

    const res = await $fetch<{
      sessionId: string
      domain: string
      pageCount: number
      totalFound: number
      maxPages: number
      urls: string[]
    }>('/api/analyze/discover', {
      method: 'POST',
      body: { domain: quickAuditDomain.value.trim() },
      headers: { authorization: `Bearer ${token}` },
    })

    sessionStorage.setItem(`analysis:${res.sessionId}`, JSON.stringify({
      urls: res.urls,
      domain: res.domain,
      pageCount: res.pageCount,
      totalFound: res.totalFound,
    }))

    await navigateTo(`/analyze/running?sessionId=${res.sessionId}`)
  } catch (error: any) {
    quickAuditError.value = error?.data?.message || error?.message || '快速檢測啟動失敗'
  } finally {
    quickAuditLoading.value = false
  }
}

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/')
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

function providerBadgeClass(status: ProviderStatus) {
  if (status === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'partial') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

function providerDotClass(status: ProviderStatus) {
  if (status === 'ready') return 'bg-emerald-500'
  if (status === 'partial') return 'bg-amber-500'
  return 'bg-rose-500'
}

function providerLabel(provider: ProviderName) {
  const labels: Record<ProviderName, string> = {
    ahrefs: 'Ahrefs',
    gsc: 'GSC',
    crawler: 'Crawler',
  }
  return labels[provider]
}

function modeLabel(mode: ProviderMode) {
  const labels: Record<ProviderMode, string> = {
    demo: 'Demo',
    live: 'Live',
    imported: '匯入',
  }
  return labels[mode]
}

onMounted(() => {
  loadUsage()
  loadProjects()
})
</script>
