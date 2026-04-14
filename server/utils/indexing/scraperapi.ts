// server/utils/indexing/scraperapi.ts
import * as cheerio from 'cheerio'
import type { EngineCheckResult } from './types'
import { isQuotaError } from './types'

const SCRAPER_URL = 'https://api.scraperapi.com'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function extractTotalFromHtml(html: string): number {
  const $ = cheerio.load(html)
  const statsText = $('#result-stats').text() || $('div[role=status]').text()
  const m = statsText.match(/約?\s*([\d,]+)\s*[項個筆]/)
  if (m) return Number(m[1].replace(/,/g, ''))
  // 退而求其次：計算 h3 數量（這頁最多 10 筆）
  const h3Count = $('h3').length
  return h3Count > 0 ? h3Count : 0
}

function extractImageCountFromHtml(html: string): number {
  const $ = cheerio.load(html)
  let count = $('img.YQ4gaf[alt]').length
  if (count === 0) count = $('.ivg-i').length
  if (count === 0) count = $('.eA0Zlc').length
  return count
}

async function fetchHtml(query: string, isImages: boolean, key: string, attempt = 0): Promise<string> {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}${isImages ? '&tbm=isch' : ''}`
  const url = `${SCRAPER_URL}?api_key=${key}&url=${encodeURIComponent(googleUrl)}`
  const res = await fetch(url)
  if (res.status === 429 && attempt < 3) {
    await sleep(Math.pow(2, attempt) * 1000)
    return fetchHtml(query, isImages, key, attempt + 1)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${text.slice(0, 200)}`)
  }
  return res.text()
}

export async function checkViaScraperApi(
  domain: string,
  keys: string[],
): Promise<EngineCheckResult | null> {
  for (const key of keys) {
    try {
      const pageHtml = await fetchHtml(`site:${domain}`, false, key)
      const pages = extractTotalFromHtml(pageHtml)

      if (pages === 0) return { pagesIndexed: 0, imagesIndexed: 0 }

      await sleep(2000)
      const imgHtml = await fetchHtml(`site:${domain}`, true, key)
      const images = extractImageCountFromHtml(imgHtml)

      return { pagesIndexed: pages, imagesIndexed: images }
    } catch (e: any) {
      if (isQuotaError(e.message)) continue
      continue
    }
  }
  return null
}
