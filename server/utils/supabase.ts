// server/utils/supabase.ts
// 使用 service role key，繞過 RLS，僅在 server routes 使用
import { createClient } from '@supabase/supabase-js'

export function useServerSupabase() {
  const config = useRuntimeConfig()
  const url = (config.supabaseUrl as string) || process.env.SUPABASE_URL || ''
  if (!url) throw new Error('SUPABASE_URL is not configured')
  return createClient(
    url,
    config.supabaseServiceRoleKey as string,
    { auth: { persistSession: false } }
  )
}
