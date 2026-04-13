<!-- pages/index.vue -->
<template>
  <div class="login-bg min-h-screen flex items-center justify-center relative overflow-hidden">

    <!-- Animated background blobs -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="login-blob-violet blob-animate absolute top-[-10%] right-[-5%] w-96 h-96 rounded-full opacity-20"></div>
      <div class="login-blob-indigo blob-animate-delay absolute bottom-[-10%] left-[-5%] w-96 h-96 rounded-full opacity-20"></div>
      <div class="login-blob-purple blob-animate absolute top-[40%] left-[20%] w-64 h-64 rounded-full opacity-10"></div>
    </div>

    <!-- Login card -->
    <div class="login-card relative w-full max-w-sm mx-4 animate-fade-up">

      <!-- Logo icon -->
      <div class="flex justify-center mb-6">
        <div class="login-icon w-16 h-16 rounded-2xl flex items-center justify-center">
          <UIcon name="i-heroicons-magnifying-glass-circle" class="w-9 h-9 text-white" />
        </div>
      </div>

      <!-- Title -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-white mb-2">SEO 分析工具</h1>
        <p class="login-subtitle text-sm">智能分析 · 優化排名 · 提升流量</p>
      </div>

      <!-- Features list -->
      <div class="login-feature-text mb-8 space-y-2">
        <div v-for="feat in features" :key="feat.text" class="flex items-center gap-3 text-sm">
          <span class="text-base">{{ feat.icon }}</span>
          <span>{{ feat.text }}</span>
        </div>
      </div>

      <!-- Google login button -->
      <button
        class="btn-google w-full flex items-center justify-center gap-3 px-5 py-3 font-medium text-sm text-gray-800"
        :disabled="loading"
        @click="signIn"
      >
        <span v-if="loading" class="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
        <img v-else src="https://www.google.com/favicon.ico" class="w-4 h-4" alt="Google" />
        以 Google 帳號登入
      </button>

      <p class="login-terms text-center text-xs mt-4">登入即同意我們的服務條款</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const loading = ref(false)

const features = [
  { icon: '🔍', text: 'Meta 標籤與 Schema 全面檢測' },
  { icon: '⚡', text: 'Core Web Vitals 效能分析' },
  { icon: '🤖', text: 'AI 中文 SEO 健診報告' },
]

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
