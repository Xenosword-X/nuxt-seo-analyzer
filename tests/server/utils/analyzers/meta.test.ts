import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeMeta } from '~/server/utils/analyzers/meta'

const goodHtml = `<!DOCTYPE html>
<html><head>
  <title>完整的頁面標題 Good Title</title>
  <meta name="description" content="這是一個完整的 meta description，長度符合建議的 50-160 字元範圍，包含重要關鍵字。" />
  <meta property="og:title" content="OG Title" />
  <meta property="og:description" content="OG Description" />
  <meta property="og:image" content="https://example.com/image.jpg" />
  <link rel="canonical" href="https://example.com/page" />
</head><body></body></html>`

const badHtml = `<!DOCTYPE html>
<html><head><title>短</title></head><body></body></html>`

describe('analyzeMeta', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('完整 meta tags：回傳高分且無問題', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(goodHtml) }))
    const result = await analyzeMeta('https://example.com/page')
    expect(result.title).toBe('完整的頁面標題 Good Title')
    expect(result.description).toContain('meta description')
    expect(result.ogTitle).toBe('OG Title')
    expect(result.ogImage).toBe('https://example.com/image.jpg')
    expect(result.canonical).toBe('https://example.com/page')
    expect(result.issues).toHaveLength(0)
    expect(result.score).toBeGreaterThanOrEqual(90)
  })

  it('缺少 description、og tags、canonical：回傳低分和問題清單', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(badHtml) }))
    const result = await analyzeMeta('https://example.com')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues.some(i => i.includes('description'))).toBe(true)
    expect(result.score).toBeLessThan(80)
  })

  it('頁面 404：回傳 score=0 和錯誤訊息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const result = await analyzeMeta('https://example.com')
    expect(result.score).toBe(0)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('fetch 失敗：回傳 score=0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    const result = await analyzeMeta('https://example.com')
    expect(result.score).toBe(0)
  })
})
