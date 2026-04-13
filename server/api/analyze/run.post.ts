// server/api/analyze/run.post.ts
import type {
  PageAnalysisResult,
  MetaTagsResult,
  CWVResult,
  RobotsSitemapResult,
  SchemaResult,
  HeadingsResult,
  ImagesResult,
  IndexingResult,
} from '../../utils/analyzers/types'

interface RunBody {
  domain: string
  urls: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RunBody>(event)

  if (!body?.urls?.length) throw createError({ statusCode: 400, message: '請提供要分析的 URL 清單' })
  if (body.urls.length > 10) throw createError({ statusCode: 400, message: '最多 10 個 URL' })
  if (!body.domain) throw createError({ statusCode: 400, message: '請提供網域名稱' })

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const { data: session, error: sessionError } = await supabase
    .from('analysis_sessions')
    .insert({
      user_id: user.id,
      domain: body.domain,
      status: 'running',
      page_count: body.urls.length,
    })
    .select()
    .single()

  if (sessionError || !session) {
    throw createError({ statusCode: 500, message: '建立分析工作階段失敗' })
  }

  // 背景執行，不 await
  runAnalysisInBackground(session.id, body.urls).catch(console.error)

  return { sessionId: session.id, status: 'running', pageCount: body.urls.length }
})

async function runAnalysisInBackground(sessionId: string, urls: string[]) {
  const supabase = useServerSupabase()

  try {
    for (const url of urls) {
      const [meta, cwv, robots, schema, headings, images, indexing] = await Promise.allSettled([
        analyzeMeta(url),
        analyzeCWV(url),
        analyzeRobots(url),
        analyzeSchema(url),
        analyzeHeadings(url),
        analyzeImages(url),
        analyzeIndexing(url),
      ])

      const metaTags: MetaTagsResult = meta.status === 'fulfilled' ? meta.value
        : { title: null, description: null, ogTitle: null, ogDescription: null, ogImage: null, canonical: null, robotsMeta: null, score: 0, issues: ['分析失敗'] }

      const coreWebVitals: CWVResult = cwv.status === 'fulfilled' ? cwv.value
        : { fcp: null, lcp: null, tbt: null, cls: null, speedScore: null, issues: ['分析失敗'] }

      const robotsSitemap: RobotsSitemapResult = robots.status === 'fulfilled' ? robots.value
        : { robotsAllowed: true, sitemapExists: false, sitemapUrl: null, issues: ['分析失敗'] }

      const schemaData: SchemaResult = schema.status === 'fulfilled' ? schema.value
        : { types: [], count: 0, issues: ['分析失敗'] }

      const headingsResult: HeadingsResult = headings.status === 'fulfilled' ? headings.value
        : { h1: [], h2Count: 0, h3Count: 0, internalLinkCount: 0, issues: ['分析失敗'] }

      const imagesResult: ImagesResult = images.status === 'fulfilled' ? images.value
        : { total: 0, missingAlt: 0, missingSrcs: [], issues: ['分析失敗'] }

      const indexingResult: IndexingResult = indexing.status === 'fulfilled' ? indexing.value
        : { isIndexed: false, resultCount: null, engineUsed: 'failed', issues: ['分析失敗'] }

      const analysisData: Omit<PageAnalysisResult, 'aiReport'> = {
        url,
        metaTags,
        coreWebVitals,
        robotsSitemap,
        schemaData,
        headings: headingsResult,
        images: imagesResult,
        indexing: indexingResult,
      }

      const aiReport = await generateAIReport(analysisData)

      await supabase.from('page_analyses').insert({
        session_id: sessionId,
        url,
        meta_tags: metaTags,
        core_web_vitals: coreWebVitals,
        robots_sitemap: robotsSitemap,
        schema_data: schemaData,
        headings: headingsResult,
        images: imagesResult,
        indexing: indexingResult,
        ai_report: aiReport,
      })
    }

    await supabase
      .from('analysis_sessions')
      .update({ status: 'done' })
      .eq('id', sessionId)
  } catch (e) {
    console.error('Analysis background job failed:', e)
    await supabase
      .from('analysis_sessions')
      .update({ status: 'error' })
      .eq('id', sessionId)
  }
}
