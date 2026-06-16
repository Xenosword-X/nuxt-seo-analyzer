export interface CrawlerSnapshot {
  crawledUrls: number
  brokenLinks: number
  missingTitles: number
  missingDescriptions: number
  duplicateTitles: number
  duplicateDescriptions: number
  redirectChains: number
  topIssues: Array<{
    type: string
    count: number
    sampleUrls: string[]
  }>
}
