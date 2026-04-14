import { describe, it, expect } from 'vitest'
import { parseKeys } from '../../../../server/utils/indexing/parse-keys'

describe('parseKeys', () => {
  it('回傳陣列本身（Nuxt destr 已轉換過的情況）', () => {
    expect(parseKeys(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('解析 JSON 陣列字串', () => {
    expect(parseKeys('["a","b"]')).toEqual(['a', 'b'])
  })

  it('單一字串視為單元素陣列', () => {
    expect(parseKeys('single-key')).toEqual(['single-key'])
  })

  it('空字串回傳空陣列', () => {
    expect(parseKeys('')).toEqual([])
    expect(parseKeys('   ')).toEqual([])
  })

  it('undefined / null 回傳空陣列', () => {
    expect(parseKeys(undefined)).toEqual([])
    expect(parseKeys(null)).toEqual([])
  })

  it('陣列中空字串會被過濾', () => {
    expect(parseKeys(['a', '', ' ', 'b'])).toEqual(['a', 'b'])
  })

  it('壞掉的 JSON 回傳空陣列（失敗安全）', () => {
    expect(parseKeys('[not valid json')).toEqual([])
  })
})
