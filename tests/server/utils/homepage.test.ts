// tests/server/utils/homepage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchHomepageLinks } from '~/server/utils/discovery/homepage'

const mockHtml = `<!DOCTYPE html>
<html>
<body>
  <a href="/about">About</a>
  <a href="/blog/post-1">Post 1</a>
  <a href="https://example.com/contact">Contact</a>
  <a href="https://other.com/external">External</a>
  <a href="/about">About duplicate</a>
  <a href="mailto:test@test.com">Email</a>
  <a href="#anchor">Anchor</a>
</body>
</html>`

describe('fetchHomepageLinks', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('只回傳同網域的內部連結，去除重複', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    }))

    const links = await fetchHomepageLinks('https://example.com')
    expect(links).toContain('https://example.com/about')
    expect(links).toContain('https://example.com/blog/post-1')
    expect(links).toContain('https://example.com/contact')
    expect(links).not.toContain('https://other.com/external')
    expect(links.filter(l => l === 'https://example.com/about')).toHaveLength(1)
  })

  it('不包含 mailto 和 anchor 連結', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockHtml),
    }))

    const links = await fetchHomepageLinks('https://example.com')
    expect(links.every(l => !l.startsWith('mailto:'))).toBe(true)
    expect(links.every(l => !l.includes('#'))).toBe(true)
  })

  it('fetch 失敗：回傳空陣列', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const links = await fetchHomepageLinks('https://example.com')
    expect(links).toEqual([])
  })

  it('回傳數量上限為 50', async () => {
    const manyLinks = Array.from({ length: 100 }, (_, i) =>
      `<a href="/page-${i}">P${i}</a>`
    ).join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`<html><body>${manyLinks}</body></html>`),
    }))

    const links = await fetchHomepageLinks('https://example.com')
    expect(links.length).toBeLessThanOrEqual(50)
  })
})
