// server/api/usage/increment.post.ts
export default defineEventHandler(async (event) => {
  const supabase = useServerSupabase()
  const config = useRuntimeConfig()

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  await incrementUsage(user.id, Number(config.appDailyDomainLimit))
  return { status: 'ok' }
})
