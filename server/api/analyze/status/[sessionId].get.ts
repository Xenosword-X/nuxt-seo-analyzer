// server/api/analyze/status/[sessionId].get.ts
export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')
  if (!sessionId) throw createError({ statusCode: 400, message: '缺少 sessionId' })

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const { data: session } = await supabase
    .from('analysis_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) throw createError({ statusCode: 404, message: '找不到分析工作階段' })

  const { data: analyses } = await supabase
    .from('page_analyses')
    .select('*')
    .eq('session_id', sessionId)
    .order('analyzed_at', { ascending: true })

  return {
    id: session.id,
    status: session.status,
    domain: session.domain,
    page_count: session.page_count,
    created_at: session.created_at,
    site_pages_indexed: session.site_pages_indexed ?? null,
    site_images_indexed: session.site_images_indexed ?? null,
    site_indexing_engine: session.site_indexing_engine ?? null,
    site_indexing_cached: session.site_indexing_cached ?? false,
    ai_report: session.ai_report ?? null,
    progress: {
      completed: (analyses ?? []).length,
      total: session.page_count,
    },
    analyses: analyses ?? [],
  }
})
