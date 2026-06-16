import { describe, expect, it } from 'vitest'
import { buildDemoProviderSnapshots, buildInitialProjectTasks } from '../../../../server/utils/projects/demo'

describe('project demo orchestration', () => {
  it('builds three provider snapshots', () => {
    const snapshots = buildDemoProviderSnapshots('project-1', 'https://example.com', new Date('2026-06-16T00:00:00.000Z'), 24)

    expect(snapshots.map((s) => s.provider)).toEqual(['ahrefs', 'gsc', 'crawler'])
    expect(snapshots.every((s) => s.project_id === 'project-1')).toBe(true)
  })

  it('builds initial tasks from demo signals', () => {
    const tasks = buildInitialProjectTasks('project-1')

    expect(tasks).toEqual([
      {
        project_id: 'project-1',
        source: 'crawler',
        title: '修復高優先級失效連結',
        description: 'Crawler demo 顯示站內存在失效連結，建議優先修復會影響使用者與搜尋引擎爬取的 URL。',
        impact: 'high',
        effort: 'medium',
        status: 'open',
      },
      {
        project_id: 'project-1',
        source: 'gsc',
        title: '改善高曝光低 CTR 查詢',
        description: 'GSC demo 顯示部分查詢曝光高但 CTR 偏低，建議重寫 title、description 並對齊搜尋意圖。',
        impact: 'medium',
        effort: 'low',
        status: 'open',
      },
      {
        project_id: 'project-1',
        source: 'ahrefs',
        title: '補強高流量頁面的內鏈與轉換入口',
        description: 'Ahrefs demo 顯示部分頁面承接較多自然搜尋流量，建議強化內鏈與 CTA 以提高商業價值。',
        impact: 'medium',
        effort: 'medium',
        status: 'open',
      },
    ])
  })
})
