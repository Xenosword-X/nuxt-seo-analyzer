import { getDemoAhrefsSnapshot } from '../providers/ahrefs/demo'
import { getDemoCrawlerSnapshot } from '../providers/crawler/demo'
import { getDemoGscSnapshot } from '../providers/gsc/demo'
import { toProviderSnapshotRow } from '../providers/shared/snapshot'
import type { ProjectTaskInsert } from './types'

export function buildDemoProviderSnapshots(projectId: string, domain: string, now = new Date(), ttlHours = 24) {
  return [
    toProviderSnapshotRow(projectId, getDemoAhrefsSnapshot(domain, now, ttlHours)),
    toProviderSnapshotRow(projectId, getDemoGscSnapshot(domain, now, ttlHours)),
    toProviderSnapshotRow(projectId, getDemoCrawlerSnapshot(domain, now, ttlHours)),
  ]
}

export function buildInitialProjectTasks(projectId: string): ProjectTaskInsert[] {
  return [
    {
      project_id: projectId,
      source: 'crawler',
      title: '修復高優先級失效連結',
      description: 'Crawler demo 顯示站內存在失效連結，建議優先修復會影響使用者與搜尋引擎爬取的 URL。',
      impact: 'high',
      effort: 'medium',
      status: 'open',
    },
    {
      project_id: projectId,
      source: 'gsc',
      title: '改善高曝光低 CTR 查詢',
      description: 'GSC demo 顯示部分查詢曝光高但 CTR 偏低，建議重寫 title、description 並對齊搜尋意圖。',
      impact: 'medium',
      effort: 'low',
      status: 'open',
    },
    {
      project_id: projectId,
      source: 'ahrefs',
      title: '補強高流量頁面的內鏈與轉換入口',
      description: 'Ahrefs demo 顯示部分頁面承接較多自然搜尋流量，建議強化內鏈與 CTA 以提高商業價值。',
      impact: 'medium',
      effort: 'medium',
      status: 'open',
    },
  ]
}
