import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeHeadings } from '~/server/utils/analyzers/headings'

const goodHtml = `<html><body>
  <h1>主標題</h1>
  <h2>章節一</h2><h2>章節二</h2>
  <h3>小節</h3>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
  <a href="https://external.com">External</a>
</body></html>`

describe('analyzeHeadings', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('正常結構：H1 一個、H2 兩個、H3 一個、內部連結 2 個', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(goodHtml) }))
    const result = await analyzeHeadings('https://example.com/page')
    expect(result.h1).toEqual(['主標題'])
    expect(result.h2Count).toBe(2)
    expect(result.h3Count).toBe(1)
    expect(result.internalLinkCount).toBe(2)
    expect(result.issues).toHaveLength(0)
  })

  it('缺少 H1：issues 包含警告', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<html><body><h2>Only H2</h2></body></html>') }))
    const result = await analyzeHeadings('https://example.com')
    expect(result.h1).toHaveLength(0)
    expect(result.issues.some(i => i.includes('H1'))).toBe(true)
  })

  it('多個 H1：issues 包含重複警告', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<html><body><h1>H1 A</h1><h1>H1 B</h1></body></html>') }))
    const result = await analyzeHeadings('https://example.com')
    expect(result.h1).toHaveLength(2)
    expect(result.issues.some(i => i.includes('重複'))).toBe(true)
  })

  it('fetch 失敗：回傳空結果', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')))
    const result = await analyzeHeadings('https://example.com')
    expect(result.h1).toHaveLength(0)
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
