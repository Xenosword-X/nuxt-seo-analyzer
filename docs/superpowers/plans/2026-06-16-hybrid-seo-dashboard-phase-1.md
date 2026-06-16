# Hybrid SEO Dashboard Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first interview-ready version of a Chinese SEO consultant SaaS dashboard with projects, demo provider snapshots, project tasks, and project detail pages.

**Architecture:** Keep the existing one-off audit flow intact, then add a project layer around it. Phase 1 uses deterministic demo providers only, stores normalized snapshots in Supabase, and exposes project APIs consumed by a redesigned dashboard and a new project detail page.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Nitro server routes, Supabase PostgreSQL, Vitest, Nuxt UI.

---

## Scope Check

The approved spec covers several phases. This plan implements Phase 1 only:

- DB schema additions for projects, provider snapshots, project tasks, and `analysis_sessions.project_id`.
- Demo providers for Ahrefs, GSC, and Crawler.
- Project list/create/detail APIs.
- Chinese dashboard and project detail UI using demo provider data.

This plan does not implement Ahrefs live API, GSC OAuth, CSV crawler import, Screaming Frog runner, project-level export, or audit-to-project execution. Those are separate follow-up plans.

---

## File Structure

Create:

- `server/utils/providers/shared/types.ts`  
  Shared provider names, modes, status, normalized result envelope, and helper types.

- `server/utils/providers/shared/snapshot.ts`  
  Runtime helpers for expiry checks and wrapping provider results into DB-ready snapshots.

- `server/utils/providers/ahrefs/types.ts`  
  Ahrefs demo data shape.

- `server/utils/providers/ahrefs/demo.ts`  
  Deterministic Ahrefs demo provider.

- `server/utils/providers/gsc/types.ts`  
  GSC demo data shape.

- `server/utils/providers/gsc/demo.ts`  
  Deterministic GSC demo provider.

- `server/utils/providers/crawler/types.ts`  
  Crawler demo data shape.

- `server/utils/providers/crawler/demo.ts`  
  Deterministic Crawler demo provider.

- `server/utils/projects/types.ts`  
  API response types for project summaries, details, provider snapshots, and tasks.

- `server/utils/projects/demo.ts`  
  Orchestrates demo provider snapshot generation and initial task generation.

- `server/utils/projects/score.ts`  
  Health score calculation from provider snapshots.

- `server/api/projects/index.get.ts`  
  Authenticated project list endpoint.

- `server/api/projects/index.post.ts`  
  Authenticated project creation endpoint.

- `server/api/projects/[projectId].get.ts`  
  Authenticated project detail endpoint.

- `server/api/projects/[projectId]/tasks/[taskId].patch.ts`  
  Authenticated task status update endpoint.

- `app/pages/projects/[projectId].vue`  
  Chinese project detail page.

- `tests/server/utils/providers/demo.test.ts`  
  Unit tests for demo provider envelopes and mode selection assumptions.

- `tests/server/utils/projects/score.test.ts`  
  Unit tests for health score calculation.

- `tests/server/utils/projects/demo.test.ts`  
  Unit tests for demo snapshot and task generation.

Modify:

- `supabase/schema.sql`  
  Add tables and RLS policies.

- `nuxt.config.ts`  
  Add provider runtime config keys with disabled live mode defaults.

- `.env.example`  
  Document optional provider env vars.

- `app/pages/dashboard.vue`  
  Replace one-off dashboard with Chinese project dashboard while preserving the legacy "quick audit" entry.

No existing route should be removed in Phase 1.

---

### Task 1: Schema And Runtime Config

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add schema migration SQL**

Append this block to `supabase/schema.sql`:

```sql
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
```

- [ ] **Step 2: Add runtime config keys**

Modify `runtimeConfig` in `nuxt.config.ts`:

```ts
runtimeConfig: {
  supabaseUrl: '',
  openaiApiKey: '',
  serpApiKeys: '',
  apifyKeys: '',
  scraperApiKeys: '',
  pagespeedApiKey: '',
  supabaseServiceRoleKey: '',
  appDailyDomainLimit: '5',
  appMaxPagesPerRun: '30',
  domainCacheTtlHours: '24',
  siteIndexingEnabled: 'true',
  ahrefsApiKey: '',
  ahrefsLiveEnabled: 'false',
  gscLiveEnabled: 'false',
  crawlerImportEnabled: 'false',
  providerSnapshotTtlHours: '24',
},
```

- [ ] **Step 3: Document env vars**

Append to `.env.example`:

```dotenv
# Hybrid dashboard providers
NUXT_AHREFS_API_KEY=
NUXT_AHREFS_LIVE_ENABLED=false
NUXT_GSC_LIVE_ENABLED=false
NUXT_CRAWLER_IMPORT_ENABLED=false
NUXT_PROVIDER_SNAPSHOT_TTL_HOURS=24
```

- [ ] **Step 4: Verify build config compiles**

Run:

```bash
npx vitest run tests/server/utils/usage.test.ts
```

Expected: existing usage tests pass. This confirms the Nuxt config change did not break test bootstrap.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql nuxt.config.ts .env.example
git commit -m "feat: add project dashboard schema"
```

---

### Task 2: Shared Provider Types And Snapshot Helpers

**Files:**
- Create: `server/utils/providers/shared/types.ts`
- Create: `server/utils/providers/shared/snapshot.ts`
- Create: `tests/server/utils/providers/demo.test.ts`

- [ ] **Step 1: Write failing tests for shared helpers**

Create `tests/server/utils/providers/demo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isSnapshotStale, toProviderSnapshotRow } from '../../../../server/utils/providers/shared/snapshot'

describe('provider snapshot helpers', () => {
  it('marks expired snapshots as stale', () => {
    expect(isSnapshotStale('2026-06-16T00:00:00.000Z', new Date('2026-06-16T01:00:00.000Z'))).toBe(true)
  })

  it('keeps future snapshots fresh', () => {
    expect(isSnapshotStale('2026-06-16T02:00:00.000Z', new Date('2026-06-16T01:00:00.000Z'))).toBe(false)
  })

  it('converts provider results into insertable rows', () => {
    const row = toProviderSnapshotRow('project-1', {
      provider: 'ahrefs',
      mode: 'demo',
      status: 'ready',
      cached: false,
      fetchedAt: '2026-06-16T00:00:00.000Z',
      expiresAt: '2026-06-17T00:00:00.000Z',
      data: { domainRating: 42 },
    })

    expect(row).toEqual({
      project_id: 'project-1',
      provider: 'ahrefs',
      mode: 'demo',
      status: 'ready',
      fetched_at: '2026-06-16T00:00:00.000Z',
      expires_at: '2026-06-17T00:00:00.000Z',
      data: { domainRating: 42 },
      error: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/server/utils/providers/demo.test.ts
```

Expected: FAIL with module not found for `server/utils/providers/shared/snapshot`.

- [ ] **Step 3: Add shared types**

Create `server/utils/providers/shared/types.ts`:

```ts
export type ProviderName = 'ahrefs' | 'gsc' | 'crawler'
export type ProviderMode = 'demo' | 'live' | 'imported'
export type ProviderStatus = 'ready' | 'failed' | 'partial'

export interface SeoProviderResult<T> {
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  cached: boolean
  fetchedAt: string
  expiresAt?: string | null
  data: T
  error?: string
}

export interface ProviderSnapshotRow<T = unknown> {
  project_id: string
  provider: ProviderName
  mode: ProviderMode
  status: ProviderStatus
  fetched_at: string
  expires_at: string | null
  data: T
  error: string | null
}
```

- [ ] **Step 4: Add snapshot helpers**

Create `server/utils/providers/shared/snapshot.ts`:

```ts
import type { ProviderSnapshotRow, SeoProviderResult } from './types'

export function isSnapshotStale(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime()
}

export function toProviderSnapshotRow<T>(
  projectId: string,
  result: SeoProviderResult<T>,
): ProviderSnapshotRow<T> {
  return {
    project_id: projectId,
    provider: result.provider,
    mode: result.mode,
    status: result.status,
    fetched_at: result.fetchedAt,
    expires_at: result.expiresAt ?? null,
    data: result.data,
    error: result.error ?? null,
  }
}

export function addHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString()
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npx vitest run tests/server/utils/providers/demo.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/providers/shared tests/server/utils/providers/demo.test.ts
git commit -m "feat: add provider snapshot helpers"
```

---

### Task 3: Demo Providers

**Files:**
- Create: `server/utils/providers/ahrefs/types.ts`
- Create: `server/utils/providers/ahrefs/demo.ts`
- Create: `server/utils/providers/gsc/types.ts`
- Create: `server/utils/providers/gsc/demo.ts`
- Create: `server/utils/providers/crawler/types.ts`
- Create: `server/utils/providers/crawler/demo.ts`
- Modify: `tests/server/utils/providers/demo.test.ts`

- [ ] **Step 1: Extend failing tests for demo providers**

Append to `tests/server/utils/providers/demo.test.ts`:

```ts
import { getDemoAhrefsSnapshot } from '../../../../server/utils/providers/ahrefs/demo'
import { getDemoGscSnapshot } from '../../../../server/utils/providers/gsc/demo'
import { getDemoCrawlerSnapshot } from '../../../../server/utils/providers/crawler/demo'

describe('demo providers', () => {
  it('returns deterministic Ahrefs demo data', () => {
    const result = getDemoAhrefsSnapshot('https://example.com', new Date('2026-06-16T00:00:00.000Z'), 24)

    expect(result.provider).toBe('ahrefs')
    expect(result.mode).toBe('demo')
    expect(result.status).toBe('ready')
    expect(result.data.domainRating).toBeGreaterThan(0)
    expect(result.data.topPages[0].url).toContain('example.com')
  })

  it('returns deterministic GSC demo data', () => {
    const result = getDemoGscSnapshot('https://example.com', new Date('2026-06-16T00:00:00.000Z'), 24)

    expect(result.provider).toBe('gsc')
    expect(result.data.topQueries[0].query).toContain('example')
    expect(result.data.ctr).toBeGreaterThan(0)
  })

  it('returns deterministic crawler demo data', () => {
    const result = getDemoCrawlerSnapshot('https://example.com', new Date('2026-06-16T00:00:00.000Z'), 24)

    expect(result.provider).toBe('crawler')
    expect(result.data.crawledUrls).toBeGreaterThan(0)
    expect(result.data.topIssues.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/server/utils/providers/demo.test.ts
```

Expected: FAIL with module not found for provider demo files.

- [ ] **Step 3: Add Ahrefs demo provider**

Create `server/utils/providers/ahrefs/types.ts`:

```ts
export interface AhrefsSnapshot {
  domainRating: number
  backlinks: number
  referringDomains: number
  organicKeywords: number
  organicTrafficEstimate: number
  topPages: Array<{
    url: string
    traffic: number
    keywords: number
  }>
  competitors: Array<{
    domain: string
    overlapScore: number
  }>
}
```

Create `server/utils/providers/ahrefs/demo.ts`:

```ts
import { normalizeDomain } from '../../domain'
import { addHours } from '../shared/snapshot'
import type { SeoProviderResult } from '../shared/types'
import type { AhrefsSnapshot } from './types'

export function getDemoAhrefsSnapshot(
  domain: string,
  now = new Date(),
  ttlHours = 24,
): SeoProviderResult<AhrefsSnapshot> {
  const normalized = normalizeDomain(domain)

  return {
    provider: 'ahrefs',
    mode: 'demo',
    status: 'ready',
    cached: false,
    fetchedAt: now.toISOString(),
    expiresAt: addHours(now, ttlHours),
    data: {
      domainRating: 46,
      backlinks: 12840,
      referringDomains: 386,
      organicKeywords: 2140,
      organicTrafficEstimate: 18400,
      topPages: [
        { url: `https://${normalized}/`, traffic: 5200, keywords: 420 },
        { url: `https://${normalized}/blog/seo-checklist`, traffic: 2600, keywords: 190 },
        { url: `https://${normalized}/services/seo`, traffic: 1800, keywords: 155 },
      ],
      competitors: [
        { domain: 'competitor-a.com', overlapScore: 72 },
        { domain: 'competitor-b.com', overlapScore: 58 },
        { domain: 'competitor-c.com', overlapScore: 41 },
      ],
    },
  }
}
```

- [ ] **Step 4: Add GSC demo provider**

Create `server/utils/providers/gsc/types.ts`:

```ts
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
```

Create `server/utils/providers/gsc/demo.ts`:

```ts
import { normalizeDomain } from '../../domain'
import { addHours } from '../shared/snapshot'
import type { SeoProviderResult } from '../shared/types'
import type { GscSnapshot } from './types'

export function getDemoGscSnapshot(
  domain: string,
  now = new Date(),
  ttlHours = 24,
): SeoProviderResult<GscSnapshot> {
  const normalized = normalizeDomain(domain)
  const brand = normalized.split('.')[0] || 'brand'

  return {
    provider: 'gsc',
    mode: 'demo',
    status: 'ready',
    cached: false,
    fetchedAt: now.toISOString(),
    expiresAt: addHours(now, ttlHours),
    data: {
      clicks: 4820,
      impressions: 126400,
      ctr: 0.038,
      averagePosition: 12.4,
      topQueries: [
        { query: `${brand} seo`, clicks: 840, impressions: 9800, ctr: 0.086, position: 3.2 },
        { query: 'seo audit checklist', clicks: 510, impressions: 18500, ctr: 0.028, position: 8.7 },
        { query: 'technical seo tool', clicks: 270, impressions: 12100, ctr: 0.022, position: 11.9 },
      ],
      opportunities: [
        { query: 'seo audit checklist', reason: '曝光高但 CTR 偏低，建議重寫 title 與 meta description。', page: `https://${normalized}/blog/seo-checklist` },
        { query: 'technical seo tool', reason: '平均排名接近首頁，建議補強內鏈與 FAQ schema。', page: `https://${normalized}/services/seo` },
      ],
    },
  }
}
```

- [ ] **Step 5: Add Crawler demo provider**

Create `server/utils/providers/crawler/types.ts`:

```ts
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
```

Create `server/utils/providers/crawler/demo.ts`:

```ts
import { normalizeDomain } from '../../domain'
import { addHours } from '../shared/snapshot'
import type { SeoProviderResult } from '../shared/types'
import type { CrawlerSnapshot } from './types'

export function getDemoCrawlerSnapshot(
  domain: string,
  now = new Date(),
  ttlHours = 24,
): SeoProviderResult<CrawlerSnapshot> {
  const normalized = normalizeDomain(domain)

  return {
    provider: 'crawler',
    mode: 'demo',
    status: 'ready',
    cached: false,
    fetchedAt: now.toISOString(),
    expiresAt: addHours(now, ttlHours),
    data: {
      crawledUrls: 186,
      brokenLinks: 7,
      missingTitles: 4,
      missingDescriptions: 18,
      duplicateTitles: 9,
      duplicateDescriptions: 14,
      redirectChains: 3,
      topIssues: [
        {
          type: 'broken_links',
          count: 7,
          sampleUrls: [`https://${normalized}/old-campaign`, `https://${normalized}/blog/deleted-post`],
        },
        {
          type: 'missing_descriptions',
          count: 18,
          sampleUrls: [`https://${normalized}/blog/seo-checklist`, `https://${normalized}/case-studies/client-a`],
        },
      ],
    },
  }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npx vitest run tests/server/utils/providers/demo.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/utils/providers tests/server/utils/providers/demo.test.ts
git commit -m "feat: add demo seo providers"
```

---

### Task 4: Project Demo Orchestration And Health Score

**Files:**
- Create: `server/utils/projects/types.ts`
- Create: `server/utils/projects/score.ts`
- Create: `server/utils/projects/demo.ts`
- Create: `tests/server/utils/projects/score.test.ts`
- Create: `tests/server/utils/projects/demo.test.ts`

- [ ] **Step 1: Write failing health score tests**

Create `tests/server/utils/projects/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calculateProjectHealthScore } from '../../../../server/utils/projects/score'

describe('calculateProjectHealthScore', () => {
  it('returns a weighted score from provider snapshots', () => {
    const score = calculateProjectHealthScore({
      auditScore: 82,
      ahrefs: { domainRating: 46 },
      gsc: { ctr: 0.038, averagePosition: 12.4 },
      crawler: { brokenLinks: 7, missingDescriptions: 18, duplicateTitles: 9 },
    })

    expect(score).toBe(69)
  })

  it('uses demo-safe defaults when audit score is missing', () => {
    const score = calculateProjectHealthScore({
      ahrefs: { domainRating: 46 },
      gsc: { ctr: 0.038, averagePosition: 12.4 },
      crawler: { brokenLinks: 7, missingDescriptions: 18, duplicateTitles: 9 },
    })

    expect(score).toBe(68)
  })
})
```

- [ ] **Step 2: Write failing demo orchestration tests**

Create `tests/server/utils/projects/demo.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npx vitest run tests/server/utils/projects/score.test.ts tests/server/utils/projects/demo.test.ts
```

Expected: FAIL with module not found for `server/utils/projects`.

- [ ] **Step 4: Add project types**

Create `server/utils/projects/types.ts`:

```ts
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
```

- [ ] **Step 5: Add health score calculator**

Create `server/utils/projects/score.ts`:

```ts
interface ScoreInput {
  auditScore?: number | null
  ahrefs?: { domainRating?: number | null } | null
  gsc?: { ctr?: number | null; averagePosition?: number | null } | null
  crawler?: {
    brokenLinks?: number | null
    missingDescriptions?: number | null
    duplicateTitles?: number | null
  } | null
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function calculateProjectHealthScore(input: ScoreInput): number {
  const audit = input.auditScore ?? 78
  const ahrefs = clamp((input.ahrefs?.domainRating ?? 40) * 1.4)
  const gscCtr = (input.gsc?.ctr ?? 0.03) * 100
  const gscPosition = input.gsc?.averagePosition ?? 15
  const gsc = clamp(50 + gscCtr * 5 - Math.max(0, gscPosition - 10) * 1.5)
  const crawlerIssues =
    (input.crawler?.brokenLinks ?? 0) * 2
    + (input.crawler?.missingDescriptions ?? 0) * 0.8
    + (input.crawler?.duplicateTitles ?? 0) * 1
  const crawler = clamp(90 - crawlerIssues)

  return clamp(audit * 0.4 + ahrefs * 0.2 + gsc * 0.2 + crawler * 0.2)
}
```

- [ ] **Step 6: Add demo orchestration**

Create `server/utils/projects/demo.ts`:

```ts
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
```

- [ ] **Step 7: Run tests**

Run:

```bash
npx vitest run tests/server/utils/projects/score.test.ts tests/server/utils/projects/demo.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/utils/projects tests/server/utils/projects
git commit -m "feat: add project demo orchestration"
```

---

### Task 5: Project APIs

**Files:**
- Create: `server/api/projects/index.get.ts`
- Create: `server/api/projects/index.post.ts`
- Create: `server/api/projects/[projectId].get.ts`
- Create: `server/api/projects/[projectId]/tasks/[taskId].patch.ts`

- [ ] **Step 1: Create project list endpoint**

Create `server/api/projects/index.get.ts`:

```ts
import { calculateProjectHealthScore } from '../../utils/projects/score'

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '尚未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: 'Token 無效' })

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  const projectIds = (projects ?? []).map((p: any) => p.id)
  const { data: snapshots } = projectIds.length
    ? await supabase.from('provider_snapshots').select('*').in('project_id', projectIds)
    : { data: [] as any[] }
  const { data: tasks } = projectIds.length
    ? await supabase.from('project_tasks').select('project_id, status').in('project_id', projectIds)
    : { data: [] as any[] }

  const summaries = (projects ?? []).map((project: any) => {
    const providerRows = (snapshots ?? []).filter((s: any) => s.project_id === project.id)
    const ahrefs = providerRows.find((s: any) => s.provider === 'ahrefs')?.data
    const gsc = providerRows.find((s: any) => s.provider === 'gsc')?.data
    const crawler = providerRows.find((s: any) => s.provider === 'crawler')?.data
    const openTaskCount = (tasks ?? []).filter((t: any) => t.project_id === project.id && t.status === 'open').length

    return {
      ...project,
      competitors: project.competitors ?? [],
      healthScore: calculateProjectHealthScore({ ahrefs, gsc, crawler }),
      openTaskCount,
      providers: providerRows,
    }
  })

  return { projects: summaries }
})
```

- [ ] **Step 2: Create project creation endpoint**

Create `server/api/projects/index.post.ts`:

```ts
import { normalizeDomain } from '../../utils/domain'
import { buildDemoProviderSnapshots, buildInitialProjectTasks } from '../../utils/projects/demo'

interface Body {
  name: string
  domain: string
  targetMarket?: string
  competitors?: string[]
}

export default defineEventHandler(async (event) => {
  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '尚未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: 'Token 無效' })

  const body = await readBody<Body>(event)
  const name = body?.name?.trim()
  const rawDomain = body?.domain?.trim()
  if (!name) throw createError({ statusCode: 400, message: '請輸入專案名稱' })
  if (!rawDomain) throw createError({ statusCode: 400, message: '請輸入主網域' })

  const domain = normalizeDomain(rawDomain)
  const competitors = (body.competitors ?? [])
    .map((d) => d.trim())
    .filter(Boolean)
    .map(normalizeDomain)

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name,
      domain,
      target_market: body.targetMarket?.trim() || null,
      competitors,
    })
    .select()
    .single()

  if (projectError || !project) throw createError({ statusCode: 500, message: '建立專案失敗' })

  const config = useRuntimeConfig(event)
  const ttlHours = Number(config.providerSnapshotTtlHours || 24)
  const snapshots = buildDemoProviderSnapshots(project.id, domain, new Date(), ttlHours)
  const tasks = buildInitialProjectTasks(project.id)

  await supabase.from('provider_snapshots').insert(snapshots)
  await supabase.from('project_tasks').insert(tasks)

  return { project }
})
```

- [ ] **Step 3: Create project detail endpoint**

Create `server/api/projects/[projectId].get.ts`:

```ts
import { calculateProjectHealthScore } from '../../utils/projects/score'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId')
  if (!projectId) throw createError({ statusCode: 400, message: '缺少 projectId' })

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '尚未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: 'Token 無效' })

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) throw createError({ statusCode: 404, message: '找不到專案' })

  const [{ data: snapshots }, { data: tasks }, { data: sessions }] = await Promise.all([
    supabase.from('provider_snapshots').select('*').eq('project_id', projectId).order('fetched_at', { ascending: false }),
    supabase.from('project_tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('analysis_sessions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(5),
  ])

  const providerRows = snapshots ?? []
  const ahrefs = providerRows.find((s: any) => s.provider === 'ahrefs')?.data
  const gsc = providerRows.find((s: any) => s.provider === 'gsc')?.data
  const crawler = providerRows.find((s: any) => s.provider === 'crawler')?.data

  return {
    project: {
      ...project,
      competitors: project.competitors ?? [],
      healthScore: calculateProjectHealthScore({ ahrefs, gsc, crawler }),
    },
    providers: providerRows,
    tasks: tasks ?? [],
    recentSessions: sessions ?? [],
  }
})
```

- [ ] **Step 4: Create task status endpoint**

Create `server/api/projects/[projectId]/tasks/[taskId].patch.ts`:

```ts
interface Body {
  status: 'open' | 'done' | 'ignored'
}

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId')
  const taskId = getRouterParam(event, 'taskId')
  if (!projectId || !taskId) throw createError({ statusCode: 400, message: '缺少任務參數' })

  const token = getHeader(event, 'authorization')?.replace('Bearer ', '')
  if (!token) throw createError({ statusCode: 401, message: '尚未登入' })

  const supabase = useServerSupabase(event)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) throw createError({ statusCode: 401, message: 'Token 無效' })

  const body = await readBody<Body>(event)
  if (!['open', 'done', 'ignored'].includes(body?.status)) {
    throw createError({ statusCode: 400, message: '任務狀態無效' })
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) throw createError({ statusCode: 404, message: '找不到專案' })

  const { data: task, error } = await supabase
    .from('project_tasks')
    .update({ status: body.status })
    .eq('id', taskId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error || !task) throw createError({ statusCode: 404, message: '找不到任務' })
  return { task }
})
```

- [ ] **Step 5: Run server tests**

Run:

```bash
npx vitest run tests/server/utils/providers/demo.test.ts tests/server/utils/projects/score.test.ts tests/server/utils/projects/demo.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/api/projects
git commit -m "feat: add project dashboard APIs"
```

---

### Task 6: Chinese Project Dashboard

**Files:**
- Modify: `app/pages/dashboard.vue`

- [ ] **Step 1: Replace dashboard template with project overview**

Replace `app/pages/dashboard.vue` with this Vue component:

```vue
<template>
  <div class="min-h-screen bg-slate-50">
    <header class="bg-slate-950 text-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <h1 class="text-lg font-semibold">SEO 專案儀表板</h1>
          <p class="text-sm text-slate-300">管理客戶網站、技術健檢與外部 SEO 資料</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="rounded-md bg-white/10 px-3 py-2 text-sm">
            今日額度 <span class="font-semibold text-emerald-300">{{ remaining }}/{{ limit }}</span>
          </div>
          <UButton color="neutral" variant="soft" icon="i-heroicons-arrow-right-on-rectangle" @click="signOut">
            登出
          </UButton>
        </div>
      </div>
    </header>

    <main class="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1fr_340px]">
      <section class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-sm text-slate-500">專案數</p>
            <p class="mt-2 text-2xl font-semibold text-slate-900">{{ projects.length }}</p>
          </div>
          <div class="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-sm text-slate-500">待處理任務</p>
            <p class="mt-2 text-2xl font-semibold text-slate-900">{{ totalOpenTasks }}</p>
          </div>
          <div class="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-sm text-slate-500">資料來源</p>
            <p class="mt-2 text-2xl font-semibold text-slate-900">Hybrid</p>
          </div>
        </div>

        <div class="rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 class="font-semibold text-slate-900">SEO 專案</h2>
            <UButton variant="ghost" icon="i-heroicons-clock" @click="navigateTo('/history')">舊分析紀錄</UButton>
          </div>

          <div v-if="pending" class="py-12 text-center text-sm text-slate-500">載入中...</div>
          <div v-else-if="projects.length === 0" class="py-12 text-center">
            <p class="font-medium text-slate-700">尚未建立專案</p>
            <p class="mt-1 text-sm text-slate-500">建立第一個 SEO 專案後，系統會自動產生 demo provider 資料。</p>
          </div>
          <div v-else class="divide-y divide-slate-100">
            <button
              v-for="project in projects"
              :key="project.id"
              class="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[1fr_120px_120px_120px]"
              @click="navigateTo(`/projects/${project.id}`)"
            >
              <div class="min-w-0">
                <p class="font-semibold text-slate-900">{{ project.name }}</p>
                <p class="truncate text-sm text-slate-500">{{ project.domain }}</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    v-for="provider in project.providers"
                    :key="provider.id || provider.provider"
                    class="rounded-full px-2 py-0.5 text-xs"
                    :class="provider.mode === 'demo' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'"
                  >
                    {{ providerLabel(provider.provider) }} · {{ provider.mode }}
                  </span>
                </div>
              </div>
              <div>
                <p class="text-xs text-slate-500">健康分數</p>
                <p class="text-xl font-semibold" :class="scoreClass(project.healthScore)">{{ project.healthScore }}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500">待辦</p>
                <p class="text-xl font-semibold text-slate-900">{{ project.openTaskCount }}</p>
              </div>
              <div>
                <p class="text-xs text-slate-500">目標市場</p>
                <p class="truncate text-sm font-medium text-slate-800">{{ project.target_market || '未設定' }}</p>
              </div>
            </button>
          </div>
        </div>
      </section>

      <aside class="space-y-4">
        <section class="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 class="font-semibold text-slate-900">新增 SEO 專案</h2>
          <div class="mt-4 space-y-3">
            <UInput v-model="form.name" placeholder="專案名稱，例如 Acme SEO Audit" />
            <UInput v-model="form.domain" placeholder="主網域，例如 example.com" />
            <UInput v-model="form.targetMarket" placeholder="目標市場，例如 台灣 / 美國" />
            <UTextarea v-model="form.competitors" placeholder="競品網域，每行一個" :rows="3" />
            <UButton block color="primary" :loading="creating" :disabled="!canCreate" @click="createProject">
              建立專案
            </UButton>
            <p v-if="errorMsg" class="text-sm text-rose-600">{{ errorMsg }}</p>
          </div>
        </section>

        <section class="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 class="font-semibold text-slate-900">快速網站健檢</h2>
          <p class="mt-1 text-sm text-slate-500">保留原本一次性分析流程，適合臨時檢查單一網站。</p>
          <div class="mt-4 flex gap-2">
            <UInput v-model="quickDomain" placeholder="example.com" />
            <UButton :loading="quickLoading" :disabled="remaining === 0 || !quickDomain.trim()" @click="startQuickAudit">
              分析
            </UButton>
          </div>
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const pending = ref(true)
const creating = ref(false)
const quickLoading = ref(false)
const errorMsg = ref('')
const used = ref(0)
const limit = ref(5)
const projects = ref<any[]>([])
const quickDomain = ref('')

const form = reactive({
  name: '',
  domain: '',
  targetMarket: '',
  competitors: '',
})

const remaining = computed(() => Math.max(0, limit.value - used.value))
const totalOpenTasks = computed(() => projects.value.reduce((sum, p) => sum + (p.openTaskCount || 0), 0))
const canCreate = computed(() => form.name.trim() && form.domain.trim())

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function loadUsage() {
  const token = await getToken()
  if (!token) return
  const data = await $fetch<{ used: number; limit: number }>('/api/usage/check', {
    headers: { authorization: `Bearer ${token}` },
  })
  used.value = data.used
  limit.value = data.limit
}

async function loadProjects() {
  const token = await getToken()
  if (!token) {
    navigateTo('/')
    return
  }
  const result = await $fetch<{ projects: any[] }>('/api/projects', {
    headers: { authorization: `Bearer ${token}` },
  })
  projects.value = result.projects
}

async function createProject() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  errorMsg.value = ''
  try {
    const token = await getToken()
    const result = await $fetch<{ project: any }>('/api/projects', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: form.name.trim(),
        domain: form.domain.trim(),
        targetMarket: form.targetMarket.trim(),
        competitors: form.competitors.split('\n').map((d) => d.trim()).filter(Boolean),
      },
    })
    await navigateTo(`/projects/${result.project.id}`)
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || '建立專案失敗'
  } finally {
    creating.value = false
  }
}

async function startQuickAudit() {
  if (!quickDomain.value.trim() || quickLoading.value) return
  quickLoading.value = true
  errorMsg.value = ''
  try {
    const token = await getToken()
    const res = await $fetch<any>('/api/analyze/discover', {
      method: 'POST',
      body: { domain: quickDomain.value.trim() },
      headers: { authorization: `Bearer ${token}` },
    })
    sessionStorage.setItem(`analysis:${res.sessionId}`, JSON.stringify({
      urls: res.urls,
      domain: res.domain,
      pageCount: res.pageCount,
      totalFound: res.totalFound,
    }))
    await navigateTo(`/analyze/running?sessionId=${res.sessionId}`)
  } catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || '分析啟動失敗'
  } finally {
    quickLoading.value = false
  }
}

function providerLabel(provider: string) {
  return provider === 'ahrefs' ? 'Ahrefs' : provider === 'gsc' ? 'GSC' : 'Crawler'
}

function scoreClass(score: number) {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

async function signOut() {
  await supabase.auth.signOut()
  navigateTo('/')
}

onMounted(async () => {
  try {
    await Promise.all([loadUsage(), loadProjects()])
  } finally {
    pending.value = false
  }
})
</script>
```

- [ ] **Step 2: Run targeted build check**

Run:

```bash
npx vitest run tests/server/utils/projects/score.test.ts
```

Expected: PASS. This does not validate Vue compilation yet, but confirms the server utilities still pass after the dashboard edit.

- [ ] **Step 3: Commit**

```bash
git add app/pages/dashboard.vue
git commit -m "feat: redesign dashboard for seo projects"
```

---

### Task 7: Project Detail Page

**Files:**
- Create: `app/pages/projects/[projectId].vue`

- [ ] **Step 1: Create project detail page**

Create `app/pages/projects/[projectId].vue`:

```vue
<template>
  <div class="min-h-screen bg-slate-50">
    <header class="bg-slate-950 text-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div class="flex items-center gap-3">
          <UButton variant="ghost" color="neutral" icon="i-heroicons-arrow-left" @click="navigateTo('/dashboard')" />
          <div>
            <h1 class="text-lg font-semibold">{{ project?.name || 'SEO 專案' }}</h1>
            <p class="text-sm text-slate-300">{{ project?.domain }}</p>
          </div>
        </div>
        <UBadge v-if="project" :color="project.healthScore >= 80 ? 'green' : project.healthScore >= 60 ? 'yellow' : 'red'">
          健康分數 {{ project.healthScore }}
        </UBadge>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-6 py-6">
      <div v-if="pending" class="py-20 text-center text-slate-500">載入中...</div>
      <div v-else-if="!project" class="py-20 text-center text-slate-500">找不到專案</div>

      <div v-else class="space-y-6">
        <section class="grid gap-4 md:grid-cols-4">
          <div class="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-sm text-slate-500">健康分數</p>
            <p class="mt-2 text-3xl font-semibold text-slate-900">{{ project.healthScore }}</p>
          </div>
          <div class="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-sm text-slate-500">待辦任務</p>
            <p class="mt-2 text-3xl font-semibold text-slate-900">{{ openTasks.length }}</p>
          </div>
          <div class="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-sm text-slate-500">競品數</p>
            <p class="mt-2 text-3xl font-semibold text-slate-900">{{ project.competitors?.length || 0 }}</p>
          </div>
          <div class="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p class="text-sm text-slate-500">最近 Audit</p>
            <p class="mt-2 text-sm font-medium text-slate-900">{{ recentSessions[0]?.created_at ? formatDate(recentSessions[0].created_at) : '尚未執行' }}</p>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-3">
          <section class="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-slate-900">Ahrefs 外部權威</h2>
              <UBadge color="yellow">{{ providerMap.ahrefs?.mode || 'demo' }}</UBadge>
            </div>
            <div class="mt-4 space-y-3 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">DR</span><span class="font-medium">{{ providerMap.ahrefs?.data?.domainRating ?? 'N/A' }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Backlinks</span><span class="font-medium">{{ formatNumber(providerMap.ahrefs?.data?.backlinks) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Referring Domains</span><span class="font-medium">{{ formatNumber(providerMap.ahrefs?.data?.referringDomains) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Organic Keywords</span><span class="font-medium">{{ formatNumber(providerMap.ahrefs?.data?.organicKeywords) }}</span></div>
            </div>
          </section>

          <section class="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-slate-900">GSC 搜尋成效</h2>
              <UBadge color="yellow">{{ providerMap.gsc?.mode || 'demo' }}</UBadge>
            </div>
            <div class="mt-4 space-y-3 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">Clicks</span><span class="font-medium">{{ formatNumber(providerMap.gsc?.data?.clicks) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Impressions</span><span class="font-medium">{{ formatNumber(providerMap.gsc?.data?.impressions) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">CTR</span><span class="font-medium">{{ formatPercent(providerMap.gsc?.data?.ctr) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Average Position</span><span class="font-medium">{{ formatDecimal(providerMap.gsc?.data?.averagePosition) }}</span></div>
            </div>
          </section>

          <section class="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-slate-900">Crawler 技術爬蟲</h2>
              <UBadge color="yellow">{{ providerMap.crawler?.mode || 'demo' }}</UBadge>
            </div>
            <div class="mt-4 space-y-3 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">Crawled URLs</span><span class="font-medium">{{ formatNumber(providerMap.crawler?.data?.crawledUrls) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Broken Links</span><span class="font-medium">{{ formatNumber(providerMap.crawler?.data?.brokenLinks) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Missing Descriptions</span><span class="font-medium">{{ formatNumber(providerMap.crawler?.data?.missingDescriptions) }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Redirect Chains</span><span class="font-medium">{{ formatNumber(providerMap.crawler?.data?.redirectChains) }}</span></div>
            </div>
          </section>
        </section>

        <section class="rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div class="border-b border-slate-200 px-5 py-4">
            <h2 class="font-semibold text-slate-900">SEO 優先修復清單</h2>
          </div>
          <div class="divide-y divide-slate-100">
            <div v-for="task in tasks" :key="task.id" class="grid gap-4 px-5 py-4 md:grid-cols-[1fr_100px_100px_140px]">
              <div>
                <p class="font-medium text-slate-900">{{ task.title }}</p>
                <p class="mt-1 text-sm text-slate-500">{{ task.description }}</p>
              </div>
              <UBadge :color="task.impact === 'high' ? 'red' : task.impact === 'medium' ? 'yellow' : 'gray'">
                {{ impactLabel(task.impact) }}
              </UBadge>
              <UBadge color="gray">{{ effortLabel(task.effort) }}</UBadge>
              <USelect
                :model-value="task.status"
                :options="statusOptions"
                @update:model-value="updateTaskStatus(task.id, String($event))"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const supabase = useSupabaseClient()
const projectId = route.params.projectId as string

const pending = ref(true)
const project = ref<any>(null)
const providers = ref<any[]>([])
const tasks = ref<any[]>([])
const recentSessions = ref<any[]>([])

const providerMap = computed(() => ({
  ahrefs: providers.value.find((p) => p.provider === 'ahrefs'),
  gsc: providers.value.find((p) => p.provider === 'gsc'),
  crawler: providers.value.find((p) => p.provider === 'crawler'),
}))
const openTasks = computed(() => tasks.value.filter((t) => t.status === 'open'))
const statusOptions = [
  { label: '待處理', value: 'open' },
  { label: '已完成', value: 'done' },
  { label: '忽略', value: 'ignored' },
]

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function loadProject() {
  const token = await getToken()
  if (!token) {
    navigateTo('/')
    return
  }
  const result = await $fetch<any>(`/api/projects/${projectId}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  project.value = result.project
  providers.value = result.providers
  tasks.value = result.tasks
  recentSessions.value = result.recentSessions
}

async function updateTaskStatus(taskId: string, status: string) {
  if (!['open', 'done', 'ignored'].includes(status)) return
  const token = await getToken()
  const result = await $fetch<any>(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: { status },
  })
  const index = tasks.value.findIndex((task) => task.id === taskId)
  if (index >= 0) tasks.value[index] = result.task
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? 'N/A' : value.toLocaleString('en-US')
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? 'N/A' : `${(value * 100).toFixed(1)}%`
}

function formatDecimal(value: number | null | undefined) {
  return value === null || value === undefined ? 'N/A' : value.toFixed(1)
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function impactLabel(value: string) {
  return value === 'high' ? '高影響' : value === 'medium' ? '中影響' : '低影響'
}

function effortLabel(value: string) {
  return value === 'high' ? '高工時' : value === 'medium' ? '中工時' : '低工時'
}

onMounted(async () => {
  try {
    await loadProject()
  } finally {
    pending.value = false
  }
})
</script>
```

- [ ] **Step 2: Confirm no undefined local component tags remain**

Run a local search to confirm the page does not reference undefined local components:

```bash
rg "ProviderPanel|MetricRow" app/pages/projects/[projectId].vue
```

Expected: no matches.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/pages/projects/[projectId].vue
git commit -m "feat: add project detail dashboard"
```

---

### Task 8: Verification

**Files:**
- No code files unless verification exposes compile errors.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npx vitest run tests/server/utils/providers/demo.test.ts tests/server/utils/projects/score.test.ts tests/server/utils/projects/demo.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm run test
```

Expected: PASS. Existing unrelated encoding-garbled test names are acceptable if tests pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual browser smoke**

Run dev server:

```bash
npm run dev
```

Open `http://localhost:3000/dashboard` and verify:

- Dashboard loads after auth.
- Creating a project redirects to `/projects/<id>`.
- Project detail shows Ahrefs, GSC, Crawler sections.
- Task status dropdown updates a task.
- "快速網站健檢" still starts the existing one-off audit flow.

- [ ] **Step 5: Final commit if verification fixes were needed**

If Step 1-4 required any fixes:

```bash
git add <changed-files>
git commit -m "fix: stabilize hybrid dashboard phase one"
```

If no fixes were needed, do not create an empty commit.
