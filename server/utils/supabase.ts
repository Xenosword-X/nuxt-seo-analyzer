// server/utils/supabase.ts
// 使用 service role key，繞過 RLS，僅在 server routes 使用
import { createClient } from '@supabase/supabase-js'

export function useServerSupabase() {
  const config = useRuntimeConfig()
  return createClient(
    process.env.SUPABASE_URL!,
    config.supabaseServiceRoleKey as string,
    { auth: { persistSession: false } }
  )
}
