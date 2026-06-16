import { normalizeDomain } from '../../utils/domain'
import { buildDemoProviderSnapshots, buildInitialProjectTasks } from '../../utils/projects/demo'
import type { JsonValue } from '../../utils/providers/shared/types'

interface CreateProjectBody {
  name?: unknown
  domain?: unknown
  targetMarket?: unknown
  competitors?: unknown
}

interface ProjectRow {
  id: string
  name: string
  domain: string
  target_market: string | null
  competitors: JsonValue | null
  created_at: string
  updated_at: string
}

function parseTtlHours(value: unknown): number {
  const ttl = Number(value)
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 24
}

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false
  if (/\s|_/.test(domain)) return false

  try {
    const parsed = new URL(`https://${domain}`)
    return parsed.hostname === domain && domain.includes('.')
  } catch {
    return false
  }
}

function normalizeCompetitorDomains(value: unknown, primaryDomain: string): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const domain = normalizeDomain(item)
    if (!isValidDomain(domain) || domain === primaryDomain) continue
    seen.add(domain)
  }

  return [...seen]
}

function toProjectResponse(project: ProjectRow) {
  return {
    ...project,
    competitors: Array.isArray(project.competitors)
      ? project.competitors.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const body = await readBody<CreateProjectBody>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const domain = typeof body?.domain === 'string' ? normalizeDomain(body.domain) : ''
  const targetMarket = typeof body?.targetMarket === 'string' && body.targetMarket.trim()
    ? body.targetMarket.trim()
    : null

  if (!name) throw createError({ statusCode: 400, message: '請提供專案名稱' })
  if (!isValidDomain(domain)) throw createError({ statusCode: 400, message: '網域格式不正確' })

  const competitors = normalizeCompetitorDomains(body?.competitors, domain)

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name,
      domain,
      target_market: targetMarket,
      competitors,
    })
    .select('id, name, domain, target_market, competitors, created_at, updated_at')
    .single()

  if (projectError || !project) {
    throw createError({ statusCode: 500, message: '建立專案失敗' })
  }

  const config = useRuntimeConfig(event)
  const ttlHours = parseTtlHours(config.providerSnapshotTtlHours)
  const projectRow = project as ProjectRow
  const snapshots = buildDemoProviderSnapshots(projectRow.id, domain, new Date(), ttlHours)
  const tasks = buildInitialProjectTasks(projectRow.id)

  try {
    const { error: snapshotsError } = await supabase.from('provider_snapshots').insert(snapshots)
    const { error: tasksError } = snapshotsError
      ? { error: null }
      : await supabase.from('project_tasks').insert(tasks)

    if (snapshotsError || tasksError) {
      throw snapshotsError ?? tasksError
    }
  } catch (initError) {
    try {
      const { error: cleanupError } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectRow.id)

      if (cleanupError) {
        console.error('Failed to cleanup partially initialized project', {
          projectId: projectRow.id,
          error: cleanupError,
        })
      }
    } catch (cleanupError) {
      console.error('Failed to cleanup partially initialized project', {
        projectId: projectRow.id,
        error: cleanupError,
      })
    }

    console.error('Failed to initialize project demo data', {
      projectId: projectRow.id,
      error: initError,
    })
    throw createError({ statusCode: 500, message: '建立專案初始化資料失敗' })
  }

  return { project: toProjectResponse(projectRow) }
})
