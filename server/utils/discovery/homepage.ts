// server/utils/discovery/homepage.ts
import * as cheerio from 'cheerio'

export async function fetchHomepageLinks(domain: string): Promise<string[]> {
  const base = domain.replace(/\/$/, '')

  try {
    const res = await fetch(base, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []

    const html = await res.text()
    return extractInternalLinks(html, base)
  } catch {
    return []
  }
}

function extractInternalLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html)
  const origin = new URL(base).origin
  const seen = new Set<string>()
  const links: string[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return
    }

    let absolute: string
    try {
      absolute = new URL(href, base).href
    } catch {
      return
    }

    if (!absolute.startsWith(origin)) return

    const clean = absolute.split('#')[0].split('?')[0]
    if (!seen.has(clean)) {
      seen.add(clean)
      links.push(clean)
    }
  })

  return links.slice(0, 50)
}
