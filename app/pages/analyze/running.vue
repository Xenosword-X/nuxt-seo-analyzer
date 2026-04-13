<!-- app/pages/analyze/running.vue -->
<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 class="text-xl font-bold text-gray-900">分析進行中...</h1>
        <p class="text-sm text-gray-500 mt-1">{{ domain }}</p>
      </header>

      <UCard>
        <div class="space-y-4">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-600">進度</span>
            <span class="font-medium">{{ completed }} / {{ total }} 頁完成</span>
          </div>

          <UProgress :value="progressPercent" class="w-full" />

          <div v-if="status === 'done'" class="text-center pt-4 space-y-3">
            <p class="text-green-600 font-medium">✅ 分析完成！</p>
            <UButton @click="navigateTo(`/analyze/result/${sessionId}`)">
              查看完整報告
            </UButton>
          </div>

          <div v-else-if="status === 'error'" class="text-center pt-4">
            <p class="text-red-500">分析過程中發生錯誤，請返回重試</p>
            <UButton variant="ghost" class="mt-2" @click="navigateTo('/dashboard')">返回</UButton>
          </div>

          <div v-else class="text-center text-sm text-gray-400 pt-2">
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
