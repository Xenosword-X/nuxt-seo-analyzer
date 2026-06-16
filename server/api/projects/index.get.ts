import { calculateProjectHealthScore } from '../../utils/projects/score'
import type { JsonValue, ProviderMode, ProviderName, ProviderStatus } from '../../utils/providers/shared/types'

interface ProjectRow {
  id: string
  name: string
  domain: string
  target_market: string | null
  competitors: JsonValue | null
  updated_at: string
}

interface ProviderSnapshotRow {
  project_id: string
  provider: string
  mode: string
  status: string
  fetched_at: string
  expires_at: string | null
  data: JsonValue | null
  error: string | null
}

interface ProjectTaskRow {
  project_id: string
  status: string
}

interface ProviderSnapshotSummary {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: JsonValue
  error: string | null
}

const providerOrder: ProviderName[] = ['ahrefs', 'gsc', 'crawler']

function isProviderName(value: string): value is ProviderName {
  return providerOrder.includes(value as ProviderName)
}

function isProviderMode(value: string): value is ProviderMode {
  return value === 'demo' || value === 'live' || value === 'imported'
}

function isProviderStatus(value: string): value is ProviderStatus {
  return value === 'ready' || value === 'failed' || value === 'partial'
}

function getJsonNumber(data: JsonValue | null | undefined, key: string): number | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeCompetitors(value: JsonValue | null): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function latestProviderSnapshots(snapshots: ProviderSnapshotRow[]): ProviderSnapshotRow[] {
  const latest = new Map<ProviderName, ProviderSnapshotRow>()

  for (const snapshot of snapshots) {
    if (!isProviderName(snapshot.provider)) continue
    const current = latest.get(snapshot.provider)
    const snapshotTime = new Date(snapshot.fetched_at).getTime()
    const currentTime = current ? new Date(current.fetched_at).getTime() : Number.NEGATIVE_INFINITY

    if (!current || snapshotTime > currentTime) {
      latest.set(snapshot.provider, snapshot)
    }
  }

  return providerOrder
    .map((provider) => latest.get(provider))
    .filter((snapshot): snapshot is ProviderSnapshotRow => Boolean(snapshot))
}

function toProviderSummary(snapshot: ProviderSnapshotRow): ProviderSnapshotSummary | null {
  if (
    !isProviderName(snapshot.provider)
    || !isProviderMode(snapshot.mode)
    || !isProviderStatus(snapshot.status)
  ) {
    return null
  }

  return {
    provider: snapshot.provider,
    mode: snapshot.mode,
    status: snapshot.status,
    fetched_at: snapshot.fetched_at,
    expires_at: snapshot.expires_at,
    data: snapshot.data ?? {},
    error: snapshot.error,
  }
}

function summarizeProviders(snapshots: ProviderSnapshotRow[]): ProviderSnapshotSummary[] {
  return latestProviderSnapshots(snapshots)
    .map(toProviderSummary)
    .filter((summary): summary is ProviderSnapshotSummary => Boolean(summary))
}

function calculateHealthScore(snapshots: ProviderSnapshotRow[]): number {
  const latest = new Map<ProviderName, ProviderSnapshotRow>()
  for (const snapshot of latestProviderSnapshots(snapshots)) {
    if (isProviderName(snapshot.provider)) latest.set(snapshot.provider, snapshot)
  }

  const ahrefs = latest.get('ahrefs')?.data
  const gsc = latest.get('gsc')?.data
  const crawler = latest.get('crawler')?.data

  return calculateProjectHealthScore({
    ahrefs: { domainRating: getJsonNumber(ahrefs, 'domainRating') },
    gsc: {
      ctr: getJsonNumber(gsc, 'ctr'),
      averagePosition: getJsonNumber(gsc, 'averagePosition'),
    },
    crawler: {
      brokenLinks: getJsonNumber(crawler, 'brokenLinks'),
      missingDescriptions: getJsonNumber(crawler, 'missingDescriptions'),
      duplicateTitles: getJsonNumber(crawler, 'duplicateTitles'),
    },
  })
}

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, domain, target_market, competitors, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (projectsError) {
    throw createError({ statusCode: 500, message: '載入專案失敗' })
  }

  const projectRows = (projects ?? []) as ProjectRow[]
  const projectIds = projectRows.map((project) => project.id)

  if (projectIds.length === 0) {
    return { projects: [] }
  }

  const [{ data: snapshots, error: snapshotsError }, { data: tasks, error: tasksError }] = await Promise.all([
    supabase
      .from('provider_snapshots')
      .select('project_id, provider, mode, status, fetched_at, expires_at, data, error')
      .in('project_id', projectIds)
      .order('fetched_at', { ascending: false }),
    supabase
      .from('project_tasks')
      .select('project_id, status')
      .in('project_id', projectIds),
  ])

  if (snapshotsError || tasksError) {
    throw createError({ statusCode: 500, message: '載入專案摘要失敗' })
  }

  const snapshotsByProject = new Map<string, ProviderSnapshotRow[]>()
  for (const snapshot of (snapshots ?? []) as ProviderSnapshotRow[]) {
    const group = snapshotsByProject.get(snapshot.project_id) ?? []
    group.push(snapshot)
    snapshotsByProject.set(snapshot.project_id, group)
  }

  const openTasksByProject = new Map<string, number>()
  for (const task of (tasks ?? []) as ProjectTaskRow[]) {
    if (task.status !== 'open') continue
    openTasksByProject.set(task.project_id, (openTasksByProject.get(task.project_id) ?? 0) + 1)
  }

  return {
    projects: projectRows.map((project) => {
      const projectSnapshots = snapshotsByProject.get(project.id) ?? []

      return {
        ...project,
        competitors: normalizeCompetitors(project.competitors),
        healthScore: calculateHealthScore(projectSnapshots),
        openTaskCount: openTasksByProject.get(project.id) ?? 0,
        providers: summarizeProviders(projectSnapshots),
      }
    }),
  }
})
