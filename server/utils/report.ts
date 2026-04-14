// server/utils/report.ts
import OpenAI from 'openai'
import type { PageAnalysisResult } from './analyzers/types'

export async function generateAIReport(
  analysis: Omit<PageAnalysisResult, 'aiReport'>
): Promise<string> {
  const config = useRuntimeConfig()
  const client = new OpenAI({ apiKey: config.openaiApiKey as string })

  const summary = {
    url: analysis.url,
    metaScore: analysis.metaTags.score,
    metaIssues: analysis.metaTags.issues,
    speedScore: analysis.coreWebVitals.speedScore,
    cwvIssues: analysis.coreWebVitals.issues,
    robotsIssues: analysis.robotsSitemap.issues,
    schemaTypes: analysis.schemaData.types,
    schemaIssues: analysis.schemaData.issues,
    headingIssues: analysis.headings.issues,
    h1Count: analysis.headings.h1.length,
    imageIssues: analysis.images.issues,
    missingAltCount: analysis.images.missingAlt,
    isIndexed: analysis.indexing.isIndexed,
    indexingIssues: analysis.indexing.issues,
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `你是一位專業的 SEO 顧問。請根據提供的頁面分析資料，用繁體中文撰寫一份簡潔的 SEO 健診報告。

報告格式（Markdown）：
## 整體評估
（1-2 句話概述）

## 主要問題
- 問題一
- 問題二
（最多 5 點，依嚴重程度排序）

## 優先改善建議
1. 建議一（具體可執行）
2. 建議二
（最多 3 點）

語氣：專業但易懂，避免過多行話。若某項指標正常，可略過不提。`,
        },
        {
          role: 'user',
          content: JSON.stringify(summary, null, 2),
        },
      ],
    })

    return response.choices[0]?.message?.content ?? '報告產生失敗'
  } catch (e) {
    console.error('AI report generation failed:', e)
    return '報告產生失敗（請確認 OpenAI API Key 是否正確設定）'
  }
}

interface SiteReportInput {
  domain: string
  siteIndexing: {
    pagesIndexed: number | null
    imagesIndexed: number | null
    engine: string | null
  }
  pages: Array<Omit<PageAnalysisResult, 'aiReport'>>
}

export async function generateSiteReport(input: SiteReportInput): Promise<string> {
  const config = useRuntimeConfig()
  const client = new OpenAI({ apiKey: config.openaiApiKey as string })

  const pageSummaries = input.pages.map((p) => ({
    url: p.url,
    metaScore: p.metaTags.score,
    metaIssues: p.metaTags.issues,
    speedScore: p.coreWebVitals.speedScore,
    cwvIssues: p.coreWebVitals.issues,
    robotsIssues: p.robotsSitemap.issues,
    schemaTypes: p.schemaData.types,
    headingIssues: p.headings.issues,
    h1Count: p.headings.h1.length,
    missingAltCount: p.images.missingAlt,
    isIndexed: p.indexing.isIndexed,
  }))

  const userPayload = {
    domain: input.domain,
    siteIndexing: input.siteIndexing,
    pageCount: input.pages.length,
    pages: pageSummaries,
  }

  const SYSTEM_PROMPT = `你是繁體中文 SEO 顧問。根據使用者提供的整站分析資料，產出一份結構化的繁體中文 SEO 健診報告，格式為 Markdown。
報告結構：
## 整體摘要
（3–5 句，點出該站最關鍵的 1–2 個問題）

## 優先改善項目（依影響度排序）
1. **[問題名稱]** — 說明 + 具體改善方向
2. ...

## 各類別檢討
### Meta 標籤
### Core Web Vitals
### 結構化資料 / Schema
### 標題結構（H1–H3）
### 圖片 SEO
### 索引與 robots
### 整站收錄量觀察

## 總結建議
（2–3 句，給一個清晰的下一步行動）

規則：
- 語氣專業、簡潔，不堆砌形容詞
- 針對具體網址或具體數字給建議
- 問題不多時不要硬湊，可略過該類別
- 不輸出 JSON、不要開場白、直接開始 Markdown`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
    temperature: 0.3,
  })

  return response.choices[0]?.message?.content?.trim() || '（AI 報告為空）'
}
