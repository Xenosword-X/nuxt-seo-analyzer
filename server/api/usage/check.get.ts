// server/api/usage/check.get.ts
import { getUsage } from '~/server/utils/usage'
import { useServerSupabase } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const supabase = useServerSupabase()
  const config = useRuntimeConfig()
  const limit = Number(config.appDailyDomainLimit)

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  return await getUsage(user.id, limit)
})
