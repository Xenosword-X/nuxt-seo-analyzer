import { describe, it, expect } from 'vitest'
import { normalizeDomain } from '../../../server/utils/domain'

describe('normalizeDomain', () => {
  it('去除 https:// 協議', () => {
    expect(normalizeDomain('https://example.com')).toBe('example.com')
  })

  it('去除 http:// 協議', () => {
    expect(normalizeDomain('http://example.com')).toBe('example.com')
  })

  it('去除 www. 前綴', () => {
    expect(normalizeDomain('https://www.example.com')).toBe('example.com')
  })

  it('去除尾端斜線與路徑', () => {
    expect(normalizeDomain('https://example.com/path')).toBe('example.com')
  })

  it('轉為小寫', () => {
    expect(normalizeDomain('Example.COM')).toBe('example.com')
  })

  it('trim 空白', () => {
    expect(normalizeDomain('  example.com  ')).toBe('example.com')
  })
})
