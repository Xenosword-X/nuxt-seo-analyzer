<template>
  <div class="min-h-screen" style="background: linear-gradient(135deg, #f8fafc 0%, #f5f3ff 60%, #eef2ff 100%)">

    <!-- Brand Header -->
    <header style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); box-shadow: 0 4px 20px rgba(79,70,229,0.3)">
      <div class="max-w-2xl mx-auto px-8 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: rgba(255,255,255,0.2)">
            <UIcon name="i-heroicons-magnifying-glass-circle" class="w-5 h-5 text-white" />
          </div>
          <span class="text-white font-bold text-lg tracking-tight">SEO 分析工具</span>
        </div>
        <div class="flex items-center gap-4">
          <!-- Usage badge -->
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
               style="background: rgba(255,255,255,0.15)">
            <span class="text-white/70">今日剩餘</span>
            <span :class="remaining === 0 ? 'text-red-300 font-bold' : 'text-emerald-300 font-bold'">
              {{ remaining }}/{{ limit }}
            </span>
          </div>
          <UButton variant="ghost" size="sm" color="white" @click="signOut">登出</UButton>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-2xl mx-auto px-8 py-8 space-y-6">

      <!-- Hero Text -->
      <div class="animate-fade-up">
        <h2 class="text-2xl font-bold text-gray-900">開始分析</h2>
        <p class="text-gray-500 text-sm mt-1">輸入網域，獲取完整 SEO 健診報告</p>
      </div>

      <!-- 輸入區 -->
      <div class="animate-fade-up animate-fade-up-delay-1 bg-white rounded-2xl p-6 card-elevated">
        <div class="flex gap-3">
          <div class="flex-1 relative">
            <div class="absolute left-3 top-1/2 -translate-y-1/2">
              <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-gray-400" />
            </div>
            <UInput
              v-model="domain"
              placeholder="example.com"
              class="pl-9 flex-1 w-full"
              :disabled="remaining === 0 || loading"
              @keyup.enter="startDiscover"
            />
          </div>
          <UButton
            color="primary"
            :loading="loading"
            :disabled="remaining === 0 || !domain.trim()"
            class="btn-brand px-5"
            @click="startDiscover"
          >
            開始分析
          </UButton>
        </div>

        <p v-if="remaining === 0" class="text-xs text-red-500 mt-3 flex items-center gap-1.5">
          <UIcon name="i-heroicons-exclamation-circle" class="w-3.5 h-3.5" />
          今日額度已用完，明天再來。
        </p>
        <p v-if="errorMsg" class="text-xs text-red-500 mt-3 flex items-center gap-1.5">
          <UIcon name="i-heroicons-exclamation-circle" class="w-3.5 h-3.5" />
          {{ errorMsg }}
        </p>
      </div>

      <!-- 最近分析紀錄 -->
      <div class="animate-fade-up animate-fade-up-delay-2 bg-white rounded-2xl card-elevated overflow-hidden">
        <!-- Card header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-4 h-4 text-violet-500" />
            <h2 class="font-semibold text-gray-800 text-sm">最近分析紀錄</h2>
          </div>
          <button class="text-xs text-violet-600 hover:text-violet-700 font-medium transition-colors" @click="navigateTo('/history')">
            查看全部 →
          </button>
        </div>

        <!-- Empty state -->
        <div v-if="recentSessions.length === 0" class="flex flex-col items-center justify-center py-10 text-center">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style="background: #f5f3ff">
            <UIcon name="i-heroicons-document-magnifying-glass" class="w-6 h-6 text-violet-400" />
          </div>
          <p class="text-gray-400 text-sm">尚無分析紀錄</p>
          <p class="text-gray-300 text-xs mt-1">輸入網域開始您的第一次分析</p>
        </div>

        <!-- Session list -->
        <div v-else class="divide-y divide-gray-50">
          <div
            v-for="session in recentSessions"
            :key="session.id"
            class="flex items-center justify-between px-6 py-3.5 cursor-pointer group transition-colors hover:bg-violet-50/40"
            @click="navigateTo(`/analyze/result/${session.id}`)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                   style="background: linear-gradient(135deg, #eef2ff, #f5f3ff)">
                <UIcon name="i-heroicons-globe-alt" class="w-4 h-4 text-indigo-500" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium text-gray-800 truncate">{{ session.domain }}</p>
                <p class="text-xs text-gray-400">{{ formatHistoryDate(session.created_at) }} ｜ {{ session.page_count }} 頁</p>
              </div>
            </div>
            <UIcon name="i-heroicons-chevron-right" class="text-gray-300 group-hover:text-violet-400 transition-colors shrink-0" />
          </div>
        </div>
      </div>

    </main>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const domain = ref('')
const loading = ref(false)
const errorMsg = ref('')
const used = ref(0)
const limit = ref(5)
const remaining = computed(() => Math.max(0, limit.value - used.value))

const recentSessions = ref<any[]>([])

function formatHistoryDate(ts: string) {
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

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function loadUsage() {
  const token = await getToken()
  if (!token) return

  try {
    const data = await $fetch<{ used: number; limit: number }>('/api/usage/check', {
      headers: { authorization: `Bearer ${token}` },
    })
    used.value = data.used
    limit.value = data.limit
  } catch {}
}

async function startDiscover() {
  errorMsg.value = ''
  loading.value = true

  const token = await getToken()
  if (!token) { loading.value = false; return }

  try {
    const result = await $fetch('/api/analyze/discover', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: { domain: domain.value },
    })
    await navigateTo({
      path: '/analyze/discover',
      query: { data: JSON.stringify(result) },
    })
  } catch (e: any) {
    errorMsg.value = e?.data?.message ?? '發生錯誤，請稍後再試'
    await loadUsage()
  } finally {
    loading.value = false
  }
}

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/')
}

onMounted(() => {
  loadUsage()
  loadRecentSessions()
})
</script>
