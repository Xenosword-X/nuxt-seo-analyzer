// server/utils/supabase.ts
// 使用 service role key，繞過 RLS，僅在 server routes 使用
import type { H3Event } from 'h3'
import { createClient } from '@supabase/supabase-js'

export function useServerSupabase(event?: H3Event) {
  // Cloudflare Workers runtime 下必須傳 event 才能讀到 env bindings
  const config = useRuntimeConfig(event)

  // 多重 fallback，相容 Node dev / Cloudflare Pages Functions
  const url = (config.supabaseUrl as string)
    || (typeof process !== 'undefined' && process.env?.NUXT_SUPABASE_URL)
    || (typeof process !== 'undefined' && process.env?.SUPABASE_URL)
    || ''
  const key = (config.supabaseServiceRoleKey as string)
    || (typeof process !== 'undefined' && process.env?.NUXT_SUPABASE_SERVICE_ROLE_KEY)
    || ''

  if (!url) throw new Error('SUPABASE_URL is not configured')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

  return createClient(url, key, { auth: { persistSession: false } })
}
