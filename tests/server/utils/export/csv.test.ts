import { describe, it, expect } from 'vitest'
import { buildCsv } from '../../../../server/utils/export/csv'

describe('buildCsv', () => {
  it('開頭有 UTF-8 BOM', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 1250, imagesIndexed: 45, engine: 'serpapi' },
      analyses: [],
    })
    expect(out.charCodeAt(0)).toBe(0xFEFF)
  })

  it('包含 metadata 註解行', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 1250, imagesIndexed: 45, engine: 'serpapi' },
      analyses: [],
    })
    expect(out).toContain('# 網域：example.com')
    expect(out).toContain('# 整站收錄：1,250 頁 / 45 圖')
  })

  it('每頁一列', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 100, imagesIndexed: 5, engine: 'apify' },
      analyses: [
        {
          url: 'https://example.com/',
          meta_tags: { title: '首頁', description: '描述', issues: [] },
          core_web_vitals: { speedScore: 85, lcp: 1800, cls: 0.05, tbt: 120, issues: [] },
          headings: { h1: ['首頁'], issues: [] },
          indexing: { isIndexed: true, issues: [] },
          schema_data: { types: ['Article'], issues: [] },
          images: { missingAlt: 0, issues: [] },
          robots_sitemap: { issues: [] },
        },
      ],
    })
    const lines = out.split('\n').filter((l) => !l.startsWith('#') && l.trim())
    expect(lines.length).toBe(2) // header + 1 row
    expect(lines[1]).toContain('https://example.com/')
    expect(lines[1]).toContain('首頁')
    expect(lines[1]).toContain('85')
  })

  it('含雙引號的 title 會被正確跳脫', () => {
    const out = buildCsv({
      domain: 'example.com',
      analyzedAt: '2026-04-14T10:32:00Z',
      siteIndexing: { pagesIndexed: 0, imagesIndexed: 0, engine: null },
      analyses: [{
        url: 'https://x/',
        meta_tags: { title: '含 " 雙引號', description: null, issues: [] },
        core_web_vitals: { speedScore: null, lcp: null, cls: null, tbt: null, issues: [] },
        headings: { h1: [], issues: [] },
        indexing: { isIndexed: false, issues: [] },
        schema_data: { types: [], issues: [] },
        images: { missingAlt: 0, issues: [] },
        robots_sitemap: { issues: [] },
      }],
    })
    expect(out).toContain('"含 "" 雙引號"')
  })
})
