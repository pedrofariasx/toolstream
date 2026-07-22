import { describe, it, expect } from 'vitest'
import { Normalizer } from '../src/normalizer.js'
import type { CompletedToolCall, NormalizedToolCall } from '../src/types.js'

describe('Normalizer', () => {
  function makeCompleted(overrides: Partial<CompletedToolCall> = {}): CompletedToolCall {
    return {
      id: 'call_1',
      provider: 'openai',
      name: 'get_weather',
      arguments: { location: 'SF' },
      raw: '{"location": "SF"}',
      index: 0,
      confidence: 0.95,
      repaired: false,
      ...overrides,
    }
  }

  it('should normalize a completed tool call', () => {
    const normalizer = new Normalizer()
    const result = normalizer.normalizeCompleted(makeCompleted())

    expect(result.id).toBe('call_1')
    expect(result.name).toBe('get_weather')
    expect(result.provider).toBe('openai')
    expect(result.completed).toBe(true)
    expect(result.confidence).toBe(0.95)
    expect(result.repaired).toBe(false)
  })

  it('should set completed to true', () => {
    const normalizer = new Normalizer()
    const result = normalizer.normalizeCompleted(makeCompleted())
    expect(result.completed).toBe(true)
  })

  it('should use default provider when provider is null', () => {
    const normalizer = new Normalizer({ defaultProvider: 'anthropic' })
    const result = normalizer.normalizeCompleted(makeCompleted({ provider: null }))
    expect(result.provider).toBe('anthropic')
  })

  it('should handle raw field based on includeRaw option', () => {
    const withRaw = new Normalizer({ includeRaw: true })
    const withoutRaw = new Normalizer({ includeRaw: false })

    const c = makeCompleted()
    expect(withRaw.normalizeCompleted(c).raw).toBe(c.raw)
    expect(withoutRaw.normalizeCompleted(c).raw).toBe('')
  })

  it('should normalize batch of calls', () => {
    const normalizer = new Normalizer()
    const batch = [
      makeCompleted({ id: 'call_1', name: 'fn1' }),
      makeCompleted({ id: 'call_2', name: 'fn2' }),
    ]
    const result = normalizer.normalizeBatch(batch)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('fn1')
    expect(result[1].name).toBe('fn2')
  })

  it('should preserve all fields through canonical form', () => {
    const normalizer = new Normalizer()
    const input = makeCompleted({
      id: 'test_id',
      name: 'test_fn',
      arguments: { key: 'val' },
      index: 5,
      confidence: 0.8,
      repaired: true,
    })
    const normalized = normalizer.normalizeCompleted(input)

    expect(normalized.id).toBe('test_id')
    expect(normalized.name).toBe('test_fn')
    expect(normalized.arguments).toEqual({ key: 'val' })
    expect(normalized.index).toBe(5)
    expect(normalized.confidence).toBe(0.8)
    expect(normalized.repaired).toBe(true)
  })
})
