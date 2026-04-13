// server/utils/discovery/sitemap.ts
import { XMLParser } from 'fast-xml-parser'

export interface SitemapUrl {
  loc: string
  lastmod?: string
  priority?: number
}

export async function fetchSitemapUrls(domain: string): Promise<SitemapUrl[]> {
  const base = domain.replace(/\/$/, '')
  const sitemapUrl = `${base}/sitemap.xml`

  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []

    const xml = await res.text()
    return parseUrlset(xml)
  } catch {
    return []
  }
}

function parseUrlset(xml: string): SitemapUrl[] {
  const parser = new XMLParser({ ignoreAttributes: false })
  const parsed = parser.parse(xml)

  const urlset = parsed?.urlset?.url
  if (urlset) {
    const arr = Array.isArray(urlset) ? urlset : [urlset]
    return arr
      .filter((u: any) => u?.loc)
      .map((u: any) => ({
        loc: String(u.loc),
        lastmod: u.lastmod ? String(u.lastmod) : undefined,
        priority: u.priority ? Number(u.priority) : undefined,
      }))
  }

  return []
}
