// server/api/analyze/run.post.ts
import pLimit from 'p-limit'
import { startSse, type SseWriter } from '../../utils/sse'
import { normalizeDomain } from '../../utils/domain'
import { checkDomainIndexing } from '../../utils/indexing/engine'
import { readCache, writeCache } from '../../utils/indexing/cache'
import { parseKeys } from '../../utils/indexing/parse-keys'
import { generateSiteReport } from '../../utils/report'
import type {
  PageAnalysisResult, MetaTagsResult, CWVResult, RobotsSitemapResult,
  SchemaResult, HeadingsResult, ImagesResult, IndexingResult,
} from '../../utils/analyzers/types'

interface RunBody {
  sessionId: string
  domain: string
  urls: string[]
}

const PAGE_BATCH_CONCURRENCY = 5

export default defineEventHandler(async (event) => {
  const body = await readBody<RunBody>(event)
  if (!body?.sessionId || !body?.domain || !body?.urls?.length) {
    throw createError({ statusCode: 400, message: '缺少必要參數' })
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const config = useRuntimeConfig()
  const writer = startSse(event)

  try {
    await runSseAnalysis(writer, supabase, config, body)
  } catch (e: any) {
    console.error('SSE run failed:', e)
    writer.send('fatal_error', { message: String(e?.message || e) })
  } finally {
    writer.close()
  }
})

async function runSseAnalysis(
  writer: SseWriter,
  supabase: ReturnType<typeof useServerSupabase>,
  config: ReturnType<typeof useRuntimeConfig>,
  body: RunBody,
) {
  const { sessionId, domain, urls } = body

  writer.send('session_started', {
    sessionId, pageCount: urls.length, maxPages: Number(config.appMaxPagesPerRun),
  })

  // 平行：整站收錄查詢
  const siteIndexingTask = (async () => {
    if (config.siteIndexingEnabled !== 'true') return
    const normalized = normalizeDomain(domain)
    const cached = await readCache(supabase, normalized)

    if (cached) {
      writer.send('site_indexing', {
        pagesIndexed: cached.pagesIndexed,
        imagesIndexed: cached.imagesIndexed,
        engine: cached.engineUsed,
        cached: true,
        checkedAt: cached.checkedAt,
      })
      await supabase.from('analysis_sessions').update({
        site_pages_indexed: cached.pagesIndexed,
        site_images_indexed: cached.imagesIndexed,
        site_indexing_engine: cached.engineUsed,
        site_indexing_cached: true,
      }).eq('id', sessionId)
      return
    }

    const keys = {
      serpapi: parseKeys(config.serpApiKeys),
      scraperapi: parseKeys(config.scraperApiKeys),
      apify: parseKeys(config.apifyKeys),
    }
    const result = await checkDomainIndexing(normalized, keys)

    await writeCache(supabase, normalized, {
      pagesIndexed: result.pagesIndexed,
      imagesIndexed: result.imagesIndexed,
      engineUsed: result.engineUsed,
    }, Number(config.domainCacheTtlHours))

    await supabase.from('analysis_sessions').update({
      site_pages_indexed: result.pagesIndexed,
      site_images_indexed: result.imagesIndexed,
      site_indexing_engine: result.engineUsed,
      site_indexing_cached: false,
    }).eq('id', sessionId)

    writer.send('site_indexing', {
      pagesIndexed: result.pagesIndexed,
      imagesIndexed: result.imagesIndexed,
      engine: result.engineUsed,
      cached: false,
      checkedAt: new Date().toISOString(),
    })
  })()

  // 平行：每頁分析（分批）
  const pageResults: PageAnalysisResult[] = []
  const limit = pLimit(PAGE_BATCH_CONCURRENCY)
  const pageTasks = urls.map((url, index) => limit(async () => {
    writer.send('page_started', { url, index: index + 1 })

    try {
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

      const data: Omit<PageAnalysisResult, 'aiReport'> = {
        url, metaTags, coreWebVitals, robotsSitemap,
        schemaData, headings: headingsResult, images: imagesResult, indexing: indexingResult,
      }

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
        ai_report: null,
      })

      pageResults.push({ ...data, aiReport: null as any })
      writer.send('page_done', { url, index: index + 1, analysis: data })
    } catch (e: any) {
      writer.send('page_error', { url, index: index + 1, error: String(e?.message || e) })
    }
  }))

  // 等所有頁面 + 整站收錄完成
  await Promise.allSettled([Promise.all(pageTasks), siteIndexingTask])

  // 取最新 session 以便帶入 AI 報告 prompt 的整站數據
  const { data: sessionRow } = await supabase
    .from('analysis_sessions')
    .select('site_pages_indexed, site_images_indexed, site_indexing_engine')
    .eq('id', sessionId)
    .single()

  // AI 整站報告
  try {
    const report = await generateSiteReport({
      domain,
      siteIndexing: {
        pagesIndexed: sessionRow?.site_pages_indexed ?? null,
        imagesIndexed: sessionRow?.site_images_indexed ?? null,
        engine: sessionRow?.site_indexing_engine ?? null,
      },
      pages: pageResults,
    })
    await supabase.from('analysis_sessions').update({ ai_report: report }).eq('id', sessionId)
    writer.send('ai_report_ready', { report })
  } catch (e: any) {
    writer.send('ai_report_error', { error: String(e?.message || e) })
  }

  await supabase.from('analysis_sessions').update({ status: 'done' }).eq('id', sessionId)
  writer.send('session_done', { sessionId, status: 'done' })
}
