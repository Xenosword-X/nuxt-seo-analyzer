// server/utils/export/csv.ts
interface CsvInput {
  domain: string
  analyzedAt: string
  siteIndexing: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engine: string | null
  }
  analyses: any[]
}

function escape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function totalIssues(a: any): number {
  return (a.meta_tags?.issues?.length || 0)
    + (a.core_web_vitals?.issues?.length || 0)
    + (a.robots_sitemap?.issues?.length || 0)
    + (a.schema_data?.issues?.length || 0)
    + (a.headings?.issues?.length || 0)
    + (a.images?.issues?.length || 0)
    + (a.indexing?.issues?.length || 0)
}

export function buildCsv(input: CsvInput): string {
  const BOM = '\uFEFF'
  const lines: string[] = []

  lines.push(BOM)
  lines.push(`# 網域：${input.domain}`)
  lines.push(`# 分析時間：${input.analyzedAt}`)
  const si = input.siteIndexing
  const siText = si.pagesIndexed === null
    ? '索引查詢失敗'
    : `${si.pagesIndexed.toLocaleString('en-US')} 頁 / ${si.imagesIndexed?.toLocaleString('en-US')} 圖（${si.engine}）`
  lines.push(`# 整站收錄：${siText}`)

  lines.push([
    'URL', 'Title', 'Description', 'H1數量', 'CWV總分',
    'LCP(ms)', 'CLS', 'TBT(ms)', '索引狀態', 'Schema類型', '圖片缺alt數', '問題總數',
  ].join(','))

  for (const a of input.analyses) {
    lines.push([
      escape(a.url),
      escape(a.meta_tags?.title),
      escape(a.meta_tags?.description),
      escape(a.headings?.h1?.length ?? 0),
      escape(a.core_web_vitals?.speedScore),
      escape(a.core_web_vitals?.lcp),
      escape(a.core_web_vitals?.cls),
      escape(a.core_web_vitals?.tbt),
      escape(a.indexing?.isIndexed ? '已收錄' : '未收錄'),
      escape((a.schema_data?.types || []).join('|')),
      escape(a.images?.missingAlt ?? 0),
      escape(totalIssues(a)),
    ].join(','))
  }

  return lines.join('\n')
}
