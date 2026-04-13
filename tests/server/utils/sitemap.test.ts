// tests/server/utils/sitemap.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSitemapUrls } from '~/server/utils/discovery/sitemap'

describe('fetchSitemapUrls', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('標準 sitemap.xml：回傳 URL 清單含 loc 和 lastmod', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(xml),
    }))

    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toHaveLength(2)
    expect(urls[0].loc).toBe('https://example.com/')
    expect(urls[0].lastmod).toBe('2026-01-01')
    expect(urls[1].loc).toBe('https://example.com/about')
    expect(urls[1].lastmod).toBeUndefined()
  })

  it('sitemap 不存在（404）：回傳空陣列', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toEqual([])
  })

  it('fetch 拋出例外（timeout）：回傳空陣列', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toEqual([])
  })

  it('單一 url 元素（非陣列）也能正確解析', async () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/only</loc></url>
</urlset>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(xml),
    }))

    const urls = await fetchSitemapUrls('https://example.com')
    expect(urls).toHaveLength(1)
    expect(urls[0].loc).toBe('https://example.com/only')
  })

  it('網域結尾有斜線也能正確組成 sitemap URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await fetchSitemapUrls('https://example.com/')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://example.com/sitemap.xml',
      expect.any(Object)
    )
  })
})
