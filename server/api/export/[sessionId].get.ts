// server/api/export/[sessionId].get.ts
import { buildCsv } from '../../utils/export/csv'
import { buildMarkdown } from '../../utils/export/markdown'

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')
  const format = getQuery(event).format as string | undefined

  if (!sessionId) throw createError({ statusCode: 400, message: '缺少 sessionId' })
  if (format !== 'csv' && format !== 'markdown') {
    throw createError({ statusCode: 400, message: 'format 必須為 csv 或 markdown' })
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const { data: session, error: sessErr } = await supabase
    .from('analysis_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)  // 避免他人 sessionId
    .single()

  if (sessErr || !session) throw createError({ statusCode: 404, message: '找不到該分析資料' })

  const { data: analyses } = await supabase
    .from('page_analyses')
    .select('*')
    .eq('session_id', sessionId)

  const shortId = String(sessionId).slice(0, 8)
  const dateStr = new Date(session.created_at).toISOString().slice(0, 10).replace(/-/g, '')
  const safeDomain = String(session.domain).replace(/[^a-z0-9.-]/gi, '_')
  const baseName = `${safeDomain}_${shortId}_${dateStr}`

  if (format === 'csv') {
    const body = buildCsv({
      domain: session.domain,
      analyzedAt: session.created_at,
      siteIndexing: {
        pagesIndexed: session.site_pages_indexed,
        imagesIndexed: session.site_images_indexed,
        engine: session.site_indexing_engine,
      },
      analyses: analyses || [],
    })
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${baseName}.csv"`)
    return body
  }

  // markdown
  const body = buildMarkdown({
    domain: session.domain,
    analyzedAt: new Date(session.created_at).toLocaleString('zh-TW', { hour12: false }),
    pageCount: session.page_count,
    siteIndexing: {
      pagesIndexed: session.site_pages_indexed,
      imagesIndexed: session.site_images_indexed,
      engine: session.site_indexing_engine,
    },
    aiReport: session.ai_report,
    analyses: analyses || [],
  })
  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${baseName}.md"`)
  return body
})
