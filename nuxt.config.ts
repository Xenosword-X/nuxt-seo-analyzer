// nuxt.config.ts
export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2025-01-01',

  modules: ['@nuxtjs/supabase', '@nuxt/ui'],

  nitro: {
    preset: 'cloudflare-pages',
  },

  // @nuxtjs/supabase 的自動重定向由 middleware/auth.global.ts 處理
  supabase: {
    redirect: false,
  },

  runtimeConfig: {
    // server-only：不暴露給前端
    openaiApiKey: '',
    serpApiKeys: '',
    apifyKeys: '',
    scraperApiKeys: '',
    pagespeedApiKey: '',
    supabaseServiceRoleKey: '',
    appDailyDomainLimit: '5',
    appMaxPagesPerRun: '10',
  },
})
