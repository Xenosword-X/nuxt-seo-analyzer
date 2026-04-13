import * as cheerio from 'cheerio'
import type { MetaTagsResult } from './types'

export async function analyzeMeta(url: string): Promise<MetaTagsResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return emptyMeta(['頁面無法訪問（HTTP ' + res.status + '）'])
    const html = await res.text()
    return parseMeta(html)
  } catch {
    return emptyMeta(['頁面載入失敗'])
  }
}

function parseMeta(html: string): MetaTagsResult {
  const $ = cheerio.load(html)
  const title = $('title').first().text().trim() || null
  const description = $('meta[name="description"]').attr('content') || null
  const ogTitle = $('meta[property="og:title"]').attr('content') || null
  const ogDescription = $('meta[property="og:description"]').attr('content') || null
  const ogImage = $('meta[property="og:image"]').attr('content') || null
  const canonical = $('link[rel="canonical"]').attr('href') || null
  const robotsMeta = $('meta[name="robots"]').attr('content') || null

  const issues: string[] = []
  let score = 100

  if (!title) { issues.push('缺少 <title> 標籤'); score -= 25 }
  else if (title.length < 10 || title.length > 60) { issues.push(`標題長度不佳（${title.length} 字元，建議 10-60）`); score -= 10 }

  if (!description) { issues.push('缺少 meta description'); score -= 20 }
  else if (description.length < 50 || description.length > 160) { issues.push(`description 長度不佳（${description.length} 字元，建議 50-160）`); score -= 10 }

  if (!canonical) { issues.push('缺少 canonical 標籤'); score -= 10 }
  if (!ogTitle) { issues.push('缺少 og:title'); score -= 5 }
  if (!ogDescription) { issues.push('缺少 og:description'); score -= 5 }
  if (!ogImage) { issues.push('缺少 og:image'); score -= 5 }

  return { title, description, ogTitle, ogDescription, ogImage, canonical, robotsMeta, score: Math.max(0, score), issues }
}

function emptyMeta(issues: string[]): MetaTagsResult {
  return { title: null, description: null, ogTitle: null, ogDescription: null, ogImage: null, canonical: null, robotsMeta: null, score: 0, issues }
}
