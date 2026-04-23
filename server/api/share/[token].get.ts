// server/api/share/[token].get.ts
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, message: '缺少 token' })

  const supabase = useServerSupabase(event)

  const { data: session } = await supabase
    .from('analysis_sessions')
    .select('id, domain, status, page_count, created_at, site_pages_indexed, site_images_indexed, site_indexing_engine, site_indexing_cached, ai_report')
    .eq('share_token', token)
    .eq('status', 'done')
    .single()

  if (!session) throw createError({ statusCode: 404, message: '找不到分享報告或報告尚未完成' })

  const { data: analyses } = await supabase
    .from('page_analyses')
    .select('id, url, meta_tags, core_web_vitals, robots_sitemap, schema_data, headings, images, indexing, analyzed_at')
    .eq('session_id', session.id)
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
    analyses: analyses ?? [],
  }
})
