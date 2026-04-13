<!-- app/pages/analyze/running.vue -->
<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-2xl mx-auto space-y-6">

      <header>
        <h1 class="text-xl font-bold text-gray-900">
          {{ status === 'done' ? '分析完成' : status === 'error' ? '分析失敗' : '分析進行中...' }}
        </h1>
        <p class="text-sm text-gray-500 mt-1">{{ domain }}</p>
      </header>

      <UCard>
        <div class="space-y-5">

          <!-- 百分比進度條 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm font-medium">
              <span class="text-gray-600">{{ completed }} / {{ total }} 頁完成</span>
              <span :class="status === 'done' ? 'text-green-600' : 'text-blue-600'">
                {{ progressPercent }}%
              </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                class="h-3 rounded-full transition-all duration-500"
                :class="status === 'done' ? 'bg-green-500' : 'bg-blue-500'"
                :style="{ width: progressPercent + '%' }"
              />
            </div>
          </div>

          <!-- 完成狀態 -->
          <div v-if="status === 'done'" class="text-center pt-2 space-y-3">
            <p class="text-green-600 font-medium">✅ 所有頁面分析完成！</p>
            <UButton @click="navigateTo(`/analyze/result/${sessionId}`)">
              查看完整報告
            </UButton>
          </div>

          <!-- 錯誤狀態 -->
          <div v-else-if="status === 'error'" class="text-center pt-2 space-y-3">
            <p class="text-red-500">分析過程中發生錯誤，請返回重試</p>
            <UButton variant="ghost" @click="navigateTo('/dashboard')">返回首頁</UButton>
          </div>

          <!-- 進行中 -->
          <div v-else class="text-center text-sm text-gray-400">
            正在分析頁面中，每 3 秒自動更新...
          </div>

        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const sessionId = route.query.sessionId as string

const status = ref<string>('running')
const completed = ref(0)
const total = ref(0)
const domain = ref('')

const progressPercent = computed(() =>
  total.value > 0 ? Math.round((completed.value / total.value) * 100) : 0
)

const supabase = useSupabaseClient()

async function poll() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return

  try {
    const result = await $fetch<any>(`/api/analyze/status/${sessionId}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    status.value = result.status
    completed.value = result.progress.completed
    total.value = result.progress.total
    domain.value = result.domain
  } catch (e) {
    console.error('Poll error:', e)
  }
}

let timer: ReturnType<typeof setInterval>

onMounted(() => {
  if (!sessionId) { navigateTo('/dashboard'); return }
  poll()
  timer = setInterval(async () => {
    await poll()
    if (status.value === 'done' || status.value === 'error') {
      clearInterval(timer)
    }
  }, 3000)
})

onUnmounted(() => clearInterval(timer))
</script>
