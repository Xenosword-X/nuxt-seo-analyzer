import { calculateProjectHealthScore } from '../../utils/projects/score'
import type { JsonValue, ProviderMode, ProviderName, ProviderStatus } from '../../utils/providers/shared/types'

interface ProjectRow {
  id: string
  name: string
  domain: string
  target_market: string | null
  competitors: JsonValue | null
  created_at: string
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

function summarizeProviders(snapshots: ProviderSnapshotRow[]) {
  return latestProviderSnapshots(snapshots)
    .map((snapshot) => {
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
    })
    .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary))
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
  const projectId = getRouterParam(event, 'projectId')
  if (!projectId) throw createError({ statusCode: 400, message: '缺少 projectId' })

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, domain, target_market, competitors, created_at, updated_at')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    throw createError({ statusCode: 404, message: '找不到專案' })
  }

  if (projectError) {
    throw createError({ statusCode: 500, message: '載入專案失敗' })
  }

  const [
    { data: snapshots, error: snapshotsError },
    { data: tasks, error: tasksError },
    { data: sessions, error: sessionsError },
  ] = await Promise.all([
    supabase
      .from('provider_snapshots')
      .select('project_id, provider, mode, status, fetched_at, expires_at, data, error')
      .eq('project_id', projectId)
      .order('fetched_at', { ascending: false }),
    supabase
      .from('project_tasks')
      .select('id, project_id, source, title, description, impact, effort, status, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('analysis_sessions')
      .select('id, domain, status, page_count, created_at, site_pages_indexed, site_images_indexed, site_indexing_engine')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (snapshotsError || tasksError || sessionsError) {
    throw createError({ statusCode: 500, message: '載入專案資料失敗' })
  }

  const projectSnapshots = (snapshots ?? []) as ProviderSnapshotRow[]
  const projectRow = project as ProjectRow

  return {
    project: {
      ...projectRow,
      competitors: normalizeCompetitors(projectRow.competitors),
      healthScore: calculateHealthScore(projectSnapshots),
    },
    providers: summarizeProviders(projectSnapshots),
    tasks: tasks ?? [],
    recentSessions: sessions ?? [],
  }
})
