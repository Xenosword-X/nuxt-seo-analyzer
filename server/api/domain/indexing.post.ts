import { normalizeDomain } from '../../utils/domain'
import { checkDomainIndexing } from '../../utils/indexing/engine'
import { readCache, writeCache } from '../../utils/indexing/cache'
import { parseKeys } from '../../utils/indexing/parse-keys'

interface Body {
  domain: string
  forceRefresh?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.domain) {
    throw createError({ statusCode: 400, message: '請提供網域' })
  }

  const config = useRuntimeConfig(event)
  // Nuxt destr 會把 env 的 'true' 轉成 boolean true，兼容兩種型別
  if (String(config.siteIndexingEnabled) !== 'true') {
    return { pagesIndexed: null, imagesIndexed: null, engineUsed: null, cached: false, error: 'disabled' }
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const domain = normalizeDomain(body.domain)

  if (!body.forceRefresh) {
    const cached = await readCache(supabase, domain)
    if (cached) {
      return {
        pagesIndexed: cached.pagesIndexed,
        imagesIndexed: cached.imagesIndexed,
        engineUsed: cached.engineUsed,
        cached: true,
        checkedAt: cached.checkedAt,
      }
    }
  }

  const keys = {
    serpapi: parseKeys(config.serpApiKeys),
    scraperapi: parseKeys(config.scraperApiKeys),
    apify: parseKeys(config.apifyKeys),
  }

  const result = await checkDomainIndexing(domain, keys)

  // 寫快取（即便失敗也寫，讓失敗暫時記住避免短時間反覆打）
  await writeCache(supabase, domain, {
    pagesIndexed: result.pagesIndexed,
    imagesIndexed: result.imagesIndexed,
    engineUsed: result.engineUsed,
  }, Number(config.domainCacheTtlHours))

  return {
    pagesIndexed: result.pagesIndexed,
    imagesIndexed: result.imagesIndexed,
    engineUsed: result.engineUsed,
    cached: false,
    checkedAt: new Date().toISOString(),
  }
})
