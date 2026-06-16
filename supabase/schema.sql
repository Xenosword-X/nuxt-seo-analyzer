-- ========================================
-- nuxt-seo-analyzer 資料庫 Schema
-- 在 Supabase Dashboard > SQL Editor 執行
-- ========================================

-- 每日使用量追蹤
CREATE TABLE IF NOT EXISTS daily_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  domain_count INT  NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

-- 分析工作階段
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','error')),
  page_count  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每頁分析結果
CREATE TABLE IF NOT EXISTS page_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES analysis_sessions(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  meta_tags       JSONB,
  core_web_vitals JSONB,
  robots_sitemap  JSONB,
  schema_data     JSONB,
  headings        JSONB,
  images          JSONB,
  indexing        JSONB,
  ai_report       TEXT,
  analyzed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- Row Level Security（RLS）
-- ========================================
ALTER TABLE daily_usage       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_analyses     ENABLE ROW LEVEL SECURITY;

-- daily_usage：只能讀寫自己的資料
CREATE POLICY "users_own_usage" ON daily_usage
  FOR ALL USING (auth.uid() = user_id);

-- analysis_sessions：只能讀寫自己的資料
CREATE POLICY "users_own_sessions" ON analysis_sessions
  FOR ALL USING (auth.uid() = user_id);

-- page_analyses：只能讀寫自己 session 的資料
CREATE POLICY "users_own_analyses" ON page_analyses
  FOR ALL USING (
    session_id IN (
      SELECT id FROM analysis_sessions WHERE user_id = auth.uid()
    )
  );

-- ========================================
-- 2026-04-14 Migration：全站分析 + 整站收錄量
-- ========================================

-- 整站收錄量快取（跨用戶全域共享）
CREATE TABLE IF NOT EXISTS domain_indexing_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          TEXT UNIQUE NOT NULL,
  pages_indexed   INT,
  images_indexed  INT,
  engine_used     TEXT,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_cache_lookup
  ON domain_indexing_cache(domain, expires_at);

-- 全域讀取公開；寫入只允許 service role（service role 繞過 RLS）
-- 顯式封鎖 anon / authenticated 的寫入，避免快取被污染
ALTER TABLE domain_indexing_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "domain_cache_read_all" ON domain_indexing_cache
  FOR SELECT USING (true);
CREATE POLICY "domain_cache_block_insert" ON domain_indexing_cache
  FOR INSERT WITH CHECK (false);
CREATE POLICY "domain_cache_block_update" ON domain_indexing_cache
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "domain_cache_block_delete" ON domain_indexing_cache
  FOR DELETE USING (false);

-- analysis_sessions 擴充欄位
ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS site_pages_indexed   INT,
  ADD COLUMN IF NOT EXISTS site_images_indexed  INT,
  ADD COLUMN IF NOT EXISTS site_indexing_engine TEXT,
  ADD COLUMN IF NOT EXISTS site_indexing_cached BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_report            TEXT;

-- ========================================
-- 2026-04-23 Migration：公開分享連結
-- ========================================
ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT gen_random_uuid();

-- ========================================
-- 2026-06-16 Migration: Project dashboard + provider snapshots
-- ========================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_market TEXT,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS provider_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('ahrefs', 'gsc', 'crawler')),
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'live', 'imported')),
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed', 'partial')),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('audit', 'ahrefs', 'gsc', 'crawler', 'ai')),
  title TEXT NOT NULL,
  description TEXT,
  impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  effort TEXT NOT NULL CHECK (effort IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON projects(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_snapshots_project_provider
  ON provider_snapshots(project_id, provider, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status
  ON project_tasks(project_id, status, created_at DESC);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_projects" ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_provider_snapshots" ON provider_snapshots
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "users_own_project_tasks" ON project_tasks
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );
