import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeSchema } from '~/server/utils/analyzers/schema'

describe('analyzeSchema', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('有 Article + BreadcrumbList JSON-LD：回傳正確 types', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Test"}</script>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>
    </head></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }))
    const result = await analyzeSchema('https://example.com')
    expect(result.types).toContain('Article')
    expect(result.types).toContain('BreadcrumbList')
    expect(result.count).toBe(2)
    expect(result.issues).toHaveLength(0)
  })

  it('無 JSON-LD：issues 包含警告', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<html><head></head></html>') }))
    const result = await analyzeSchema('https://example.com')
    expect(result.count).toBe(0)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('@type 為陣列：全部回傳', async () => {
    const html = `<html><head><script type="application/ld+json">{"@type":["Product","Thing"]}</script></head></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }))
    const result = await analyzeSchema('https://example.com')
    expect(result.types).toContain('Product')
    expect(result.types).toContain('Thing')
  })

  it('無效 JSON：忽略並繼續', async () => {
    const html = `<html><head>
      <script type="application/ld+json">INVALID</script>
      <script type="application/ld+json">{"@type":"Article"}</script>
    </head></html>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }))
    const result = await analyzeSchema('https://example.com')
    expect(result.types).toContain('Article')
    expect(result.count).toBe(1)
  })
})
