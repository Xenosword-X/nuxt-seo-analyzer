interface UpdateTaskBody {
  status?: unknown
}

type ProjectTaskStatus = 'open' | 'done' | 'ignored'

function isProjectTaskStatus(value: unknown): value is ProjectTaskStatus {
  return value === 'open' || value === 'done' || value === 'ignored'
}

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId')
  const taskId = getRouterParam(event, 'taskId')

  if (!projectId) throw createError({ statusCode: 400, message: '缺少 projectId' })
  if (!taskId) throw createError({ statusCode: 400, message: '缺少 taskId' })

  const body = await readBody<UpdateTaskBody>(event)
  if (!isProjectTaskStatus(body?.status)) {
    throw createError({ statusCode: 400, message: '任務狀態不正確' })
  }

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: '無效的 Token' })

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) {
    throw createError({ statusCode: 404, message: '找不到專案' })
  }

  const { data: task, error: taskError } = await supabase
    .from('project_tasks')
    .update({ status: body.status })
    .eq('id', taskId)
    .eq('project_id', projectId)
    .select('id, project_id, source, title, description, impact, effort, status, created_at')
    .single()

  if (!task) {
    throw createError({ statusCode: 404, message: '找不到任務' })
  }

  if (taskError) {
    throw createError({ statusCode: 500, message: '更新任務失敗' })
  }

  return { task }
})
