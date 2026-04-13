import { fetchSitemapUrls } from '~/server/utils/discovery/sitemap'
import { fetchHomepageLinks } from '~/server/utils/discovery/homepage'
import { incrementUsage } from '~/server/utils/usage'
import { useServerSupabase } from '~/server/utils/supabase'

interface DiscoverBody {
  domain: string
}

export default defineEventHandler(async (event) => {
  const supabase = useServerSupabase()
  const config = useRuntimeConfig()

  const body = await readBody<DiscoverBody>(event)
  if (!body?.domain) {
    throw createError({ statusCode: 400, message: '請輸入網域' })
  }

  // 正規化網域
  let domain = body.domain.trim()
  if (!domain.startsWith('http')) domain = `https://${domain}`

  try {
    new URL(domain)
  } catch {
    throw createError({ statusCode: 400, message: '網域格式不正確' })
  }

  // 驗證登入並消耗每日額度
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  await incrementUsage(user.id, Number(config.appDailyDomainLimit))

  // 平行掃描 sitemap 與首頁
  const [sitemapUrls, homepageLinks] = await Promise.all([
    fetchSitemapUrls(domain),
    fetchHomepageLinks(domain),
  ])

  // 合併去重（sitemap 優先）
  const seen = new Set<string>()
  const pages: Array<{ url: string; lastmod?: string; source: 'sitemap' | 'homepage' }> = []

  for (const u of sitemapUrls) {
    if (!seen.has(u.loc)) {
      seen.add(u.loc)
      pages.push({ url: u.loc, lastmod: u.lastmod, source: 'sitemap' })
    }
  }

  for (const link of homepageLinks) {
    if (!seen.has(link)) {
      seen.add(link)
      pages.push({ url: link, source: 'homepage' })
    }
  }

  const limited = pages.slice(0, 100)

  return {
    domain,
    total: limited.length,
    pages: limited,
    maxSelect: Number(config.appMaxPagesPerRun),
  }
})
