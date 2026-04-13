import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeRobots } from '~/server/utils/analyzers/robots'

describe('analyzeRobots', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('robots.txt 允許且 sitemap 存在：無問題', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('User-agent: *\nAllow: /') })
      .mockResolvedValueOnce({ ok: true })
    )
    const result = await analyzeRobots('https://example.com/page')
    expect(result.robotsAllowed).toBe(true)
    expect(result.sitemapExists).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('robots.txt 封鎖路徑：robotsAllowed=false 和問題', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('User-agent: *\nDisallow: /page') })
      .mockResolvedValueOnce({ ok: false })
    )
    const result = await analyzeRobots('https://example.com/page')
    expect(result.robotsAllowed).toBe(false)
    expect(result.issues.some(i => i.includes('robots'))).toBe(true)
  })

  it('robots.txt 不存在：視為允許', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
    )
    const result = await analyzeRobots('https://example.com/page')
    expect(result.robotsAllowed).toBe(true)
    expect(result.sitemapExists).toBe(false)
  })

  it('sitemap 不存在：issues 包含 sitemap 警告', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') })
      .mockResolvedValueOnce({ ok: false })
    )
    const result = await analyzeRobots('https://example.com/')
    expect(result.sitemapExists).toBe(false)
    expect(result.issues.some(i => i.includes('sitemap'))).toBe(true)
  })
})
