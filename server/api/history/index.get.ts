// server/api/history/index.get.ts
export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const limit = Number(getQuery(event).limit ?? 20)

  const { data: sessions } = await supabase
    .from('analysis_sessions')
    .select('id, domain, status, page_count, created_at, site_pages_indexed, site_images_indexed, site_indexing_engine')
    .eq('user_id', user.id)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(limit)

  return { sessions: sessions ?? [] }
})
