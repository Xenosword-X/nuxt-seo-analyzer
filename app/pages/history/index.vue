<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-3xl mx-auto space-y-6">

      <header class="flex items-center gap-4">
        <UButton variant="ghost" icon="i-heroicons-arrow-left" size="sm" @click="navigateTo('/dashboard')" />
        <h1 class="text-xl font-bold text-gray-900">分析歷史紀錄</h1>
      </header>

      <UCard>
        <div v-if="pending" class="text-center py-10 text-gray-400">載入中...</div>

        <div v-else-if="sessions.length === 0" class="text-center py-10 text-gray-400">
          尚無分析紀錄
        </div>

        <div v-else class="divide-y">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="flex items-center justify-between py-4 hover:bg-gray-50 px-2 rounded-lg cursor-pointer transition-colors"
            @click="navigateTo(`/analyze/result/${session.id}`)"
          >
            <div class="space-y-1">
              <p class="font-medium text-gray-900">{{ session.domain }}</p>
              <p class="text-sm text-gray-500">
                {{ formatDate(session.created_at) }} ｜ {{ session.page_count }} 頁
              </p>
            </div>
            <div class="flex items-center gap-3">
              <UBadge color="green" variant="soft">已完成</UBadge>
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400" />
            </div>
          </div>
        </div>
      </UCard>

    </div>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const pending = ref(true)
const sessions = ref<any[]>([])

async function load() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) { navigateTo('/'); return }

  try {
    const result = await $fetch<{ sessions: any[] }>('/api/history', {
      headers: { authorization: `Bearer ${token}` },
    })
    sessions.value = result.sessions
  } catch {
    sessions.value = []
  } finally {
    pending.value = false
  }
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

onMounted(load)
</script>
