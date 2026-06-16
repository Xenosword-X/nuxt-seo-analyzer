import type { ProviderMode, ProviderName, ProviderStatus } from '../providers/shared/types'

export interface ProjectTaskInsert {
  project_id: string
  source: 'audit' | 'ahrefs' | 'gsc' | 'crawler' | 'ai'
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  effort: 'high' | 'medium' | 'low'
  status: 'open' | 'done' | 'ignored'
}

export interface ProviderSnapshotSummary {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: any
  error: string | null
}

export interface ProjectSummary {
  id: string
  name: string
  domain: string
  target_market: string | null
  competitors: string[]
  updated_at: string
  healthScore: number
  openTaskCount: number
  providers: ProviderSnapshotSummary[]
}
