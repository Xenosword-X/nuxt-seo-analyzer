// server/api/analyze/discover.post.ts
interface DiscoverBody {
  domain: string
}

export default defineEventHandler(async (event) => {
  const supabase = useServerSupabase(event)
  const config = useRuntimeConfig(event)

  const body = await readBody<DiscoverBody>(event)
  if (!body?.domain) {
    throw createError({ statusCode: 400, message: '請輸入網域' })
  }

  let domain = body.domain.trim()
  if (!domain.startsWith('http')) domain = `https://${domain}`

  try {
    new URL(domain)
  } catch {
    throw createError({ statusCode: 400, message: '網域格式不正確' })
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  // 先掃頁面
  const [sitemapUrls, homepageLinks] = await Promise.all([
    fetchSitemapUrls(domain),
    fetchHomepageLinks(domain),
  ])

  const seen = new Set<string>()
  const pages: string[] = []
  for (const u of sitemapUrls) {
    if (!seen.has(u.loc)) { seen.add(u.loc); pages.push(u.loc) }
  }
  for (const link of homepageLinks) {
    if (!seen.has(link)) { seen.add(link); pages.push(link) }
  }

  const maxPages = Number(config.appMaxPagesPerRun)
  const totalFound = pages.length
  const limited = pages.slice(0, maxPages)

  if (limited.length === 0) {
    throw createError({ statusCode: 404, message: '找不到可分析的頁面（無 sitemap 且首頁無內部連結）' })
  }

  // 扣額度
  await incrementUsage(user.id, Number(config.appDailyDomainLimit), event)

  // 建立 session
  const { data: session, error: sessionError } = await supabase
    .from('analysis_sessions')
    .insert({
      user_id: user.id,
      domain,
      status: 'running',
      page_count: limited.length,
    })
    .select()
    .single()

  if (sessionError || !session) {
    throw createError({ statusCode: 500, message: '建立分析工作階段失敗' })
  }

  return {
    sessionId: session.id,
    domain,
    pageCount: limited.length,
    totalFound,
    maxPages,
    urls: limited,
  }
})
