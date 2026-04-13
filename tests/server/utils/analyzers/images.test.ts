import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeImages } from '~/server/utils/analyzers/images'

describe('analyzeImages', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('所有圖片都有 alt：missingAlt=0，issues 為空', async () => {
    const html = `<html><body><img src="/a.jpg" alt="圖A" /><img src="/b.jpg" alt="圖B" /></body></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }))
    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(2)
    expect(result.missingAlt).toBe(0)
    expect(result.issues).toHaveLength(0)
  })

  it('有圖片缺少 alt：正確計算並列出 src', async () => {
    const html = `<html><body>
      <img src="/a.jpg" alt="有" />
      <img src="/b.jpg" />
      <img src="/c.jpg" alt="" />
    </body></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }))
    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(3)
    expect(result.missingAlt).toBe(2)
    expect(result.missingSrcs).toContain('/b.jpg')
    expect(result.missingSrcs).toContain('/c.jpg')
    expect(result.issues.some(i => i.includes('alt'))).toBe(true)
  })

  it('無圖片：total=0，issues 為空', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<html><body><p>純文字</p></body></html>') }))
    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(0)
    expect(result.missingAlt).toBe(0)
    expect(result.issues).toHaveLength(0)
  })

  it('missingSrcs 上限為 10 筆', async () => {
    const imgs = Array.from({ length: 15 }, (_, i) => `<img src="/img-${i}.jpg" />`).join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(`<html><body>${imgs}</body></html>`) }))
    const result = await analyzeImages('https://example.com')
    expect(result.total).toBe(15)
    expect(result.missingAlt).toBe(15)
    expect(result.missingSrcs.length).toBeLessThanOrEqual(10)
  })
})
