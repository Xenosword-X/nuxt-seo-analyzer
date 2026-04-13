import * as cheerio from 'cheerio'
import type { HeadingsResult } from './types'

export async function analyzeHeadings(url: string): Promise<HeadingsResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAnalyzer/1.0)' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return emptyHeadings(['頁面無法訪問'])
    const html = await res.text()
    return parseHeadings(html, url)
  } catch {
    return emptyHeadings(['頁面載入失敗'])
  }
}

function parseHeadings(html: string, url: string): HeadingsResult {
  const $ = cheerio.load(html)
  const origin = new URL(url).origin
  const h1 = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const h2Count = $('h2').length
  const h3Count = $('h3').length
  let internalLinkCount = 0
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    try {
      const abs = new URL(href, url).href
      if (abs.startsWith(origin)) internalLinkCount++
    } catch { }
  })
  const issues: string[] = []
  if (h1.length === 0) issues.push('缺少 H1 標題，建議加入主要關鍵字')
  else if (h1.length > 1) issues.push(`H1 標題重複（共 ${h1.length} 個，建議只有 1 個）`)
  if (h2Count === 0) issues.push('缺少 H2 標題，內容層次不清')
  return { h1, h2Count, h3Count, internalLinkCount, issues }
}

function emptyHeadings(issues: string[]): HeadingsResult {
  return { h1: [], h2Count: 0, h3Count: 0, internalLinkCount: 0, issues }
}
