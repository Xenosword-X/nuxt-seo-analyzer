export interface GscSnapshot {
  clicks: number
  impressions: number
  ctr: number
  averagePosition: number
  topQueries: Array<{
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }>
  opportunities: Array<{
    query: string
    reason: string
    page?: string
  }>
}
