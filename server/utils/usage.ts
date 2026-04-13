// server/utils/usage.ts
import { useServerSupabase } from '~/server/utils/supabase'

export interface UsageInfo {
  used: number
  limit: number
  remaining: number
}

export async function getUsage(userId: string, dailyLimit: number): Promise<UsageInfo> {
  const supabase = useServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('daily_usage')
    .select('domain_count')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  const used = data?.domain_count ?? 0
  return { used, limit: dailyLimit, remaining: Math.max(0, dailyLimit - used) }
}

export async function incrementUsage(userId: string, dailyLimit: number): Promise<void> {
  const supabase = useServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('daily_usage')
    .select('id, domain_count')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  if (existing && existing.domain_count >= dailyLimit) {
    throw createError({ statusCode: 429, message: `今日額度已用完（上限 ${dailyLimit} 個網域）` })
  }

  if (existing) {
    await supabase
      .from('daily_usage')
      .update({ domain_count: existing.domain_count + 1 })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('daily_usage')
      .insert({ user_id: userId, date: today, domain_count: 1 })
  }
}
