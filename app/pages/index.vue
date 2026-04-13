<!-- pages/index.vue -->
<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-sm text-center">
      <h1 class="text-2xl font-bold text-gray-900 mb-2">SEO 分析工具</h1>
      <p class="text-gray-500 text-sm mb-8">以 Google 帳號登入開始使用</p>
      <UButton
        color="white"
        variant="solid"
        size="lg"
        class="w-full"
        :loading="loading"
        @click="signIn"
      >
        <template #leading>
          <img src="https://www.google.com/favicon.ico" class="w-4 h-4" alt="Google" />
        </template>
        以 Google 帳號登入
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const loading = ref(false)

async function signIn() {
  loading.value = true
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/confirm`,
    },
  })
  loading.value = false
}
</script>
