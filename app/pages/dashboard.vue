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
        <p v-if="errorMsg" class="text-sm text-red-500 mt-2">{{ errorMsg }}</p>
      </UCard>

      <!-- 歷史紀錄（Phase 3 實作） -->
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
const supabase = useSupabaseClient()
const domain = ref('')
const loading = ref(false)
const errorMsg = ref('')
const used = ref(0)
const limit = ref(5)
const remaining = computed(() => Math.max(0, limit.value - used.value))

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

onMounted(loadUsage)
</script>
