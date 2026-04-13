// nuxt.config.ts
export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2025-01-01',

  modules: ['@nuxtjs/supabase', '@nuxt/ui'],

  nitro: {
    preset: 'cloudflare-pages',
  },

  supabase: {
    redirectOptions: {
      login: '/',
      callback: '/confirm',
      exclude: ['/'],
    },
  },

  router: {
    middleware: ['auth'],
  },

  runtimeConfig: {
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
