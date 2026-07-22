import { describe, it, expect } from 'vitest'
import { ConfidenceScorer } from '../src/confidence.js'
import type { PendingToolCall } from '../src/types.js'

describe('ConfidenceScorer', () => {
  function makeCall(overrides: Partial<PendingToolCall> = {}): PendingToolCall {
    return {
      id: 'call_1',
      provider: null,
      name: 'test_function',
      arguments: '{"key": "value"}',
      index: 0,
      confidence: 0,
      startTime: Date.now(),
      repaired: false,
      ...overrides,
    }
  }

  it('should give high score for complete tool call', () => {
    const scorer = new ConfidenceScorer()
    const result = scorer.evaluate(makeCall())
    expect(result.score).toBeGreaterThan(0.7)
    expect(result.executable).toBe(true)
  })

  it('should give low score for missing name', () => {
    const scorer = new ConfidenceScorer()
    const result = scorer.evaluate(makeCall({ name: undefined }))
    expect(result.score).toBeLessThan(0.7)
    expect(result.executable).toBe(false)
  })

  it('should give low score for no arguments', () => {
    const scorer = new ConfidenceScorer()
    const result = scorer.evaluate(makeCall({ arguments: '' }))
    expect(result.score).toBeLessThan(0.5)
  })

  it('should include factor breakdown', () => {
    const scorer = new ConfidenceScorer()
    const result = scorer.evaluate(makeCall())
    expect(result.factors.length).toBeGreaterThan(0)
    const factorNames = result.factors.map(f => f.name)
    expect(factorNames).toContain('name-presence')
    expect(factorNames).toContain('id-presence')
    expect(factorNames).toContain('argument-completeness')
    expect(factorNames).toContain('argument-structure')
    expect(factorNames).toContain('json-validity')
    expect(factorNames).toContain('buffer-size')
  })

  it('should respect custom threshold', () => {
    const scorer = new ConfidenceScorer({ threshold: 0.9 })
    const call = makeCall({ arguments: '{"only": "partial"' })
    const result = scorer.evaluate(call)
    expect(result.threshold).toBe(0.9)
  })

  it('should evaluate argument completeness based on brace balance', () => {
    const scorer = new ConfidenceScorer()

    const balanced = scorer.evaluate(makeCall({ arguments: '{"a": 1}' }))
    const unbalanced = scorer.evaluate(makeCall({ arguments: '{"a": 1' }))

    const balancedFactor = balanced.factors.find(f => f.name === 'argument-completeness')
    const unbalancedFactor = unbalanced.factors.find(f => f.name === 'argument-completeness')

    expect(balancedFactor!.value).toBe(1.0)
    expect(unbalancedFactor!.value).toBeLessThan(1.0)
  })

  it('should detect JSON validity', () => {
    const scorer = new ConfidenceScorer()

    const valid = scorer.evaluate(makeCall({ arguments: '{"a": 1}' }))
    const partial = scorer.evaluate(makeCall({ arguments: '{"a": ' }))

    const validFactor = valid.factors.find(f => f.name === 'json-validity')
    const partialFactor = partial.factors.find(f => f.name === 'json-validity')

    expect(validFactor!.value).toBe(1.0)
    expect(partialFactor!.value).toBe(0.3)
  })
})
