import * as cheerio from 'cheerio'
import type { ImagesResult } from './types'

export async function analyzeImages(url: string): Promise<ImagesResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { total: 0, missingAlt: 0, missingSrcs: [], issues: ['頁面無法訪問'] }
    const html = await res.text()
    return parseImages(html)
  } catch {
    return { total: 0, missingAlt: 0, missingSrcs: [], issues: ['頁面載入失敗'] }
  }
}

function parseImages(html: string): ImagesResult {
  const $ = cheerio.load(html)
  const imgs = $('img').toArray()
  const total = imgs.length
  const missingSrcs: string[] = []
  imgs.forEach(el => {
    const alt = $(el).attr('alt')
    if (alt === undefined || alt === null || alt.trim() === '') {
      missingSrcs.push($(el).attr('src') ?? '')
    }
  })
  const missingAlt = missingSrcs.length
  const issues = missingAlt > 0 ? [`${missingAlt} 張圖片缺少 alt 屬性，影響無障礙性與 SEO`] : []
  return { total, missingAlt, missingSrcs: missingSrcs.slice(0, 10), issues }
}
