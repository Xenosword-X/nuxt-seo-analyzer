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

// STUB: real implementation in Task E1
export async function generateSiteReport(input: any): Promise<string> {
  throw new Error('generateSiteReport not yet implemented (Task E1)')
}
