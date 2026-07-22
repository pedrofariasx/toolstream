import { describe, it, expect } from 'vitest'
import { RecoveryEngine, RecoveryStrategy } from '../src/recovery.js'
import { ToolStreamError } from '../src/types.js'

describe('RecoveryEngine', () => {
  it('should attempt repair for parse errors', () => {
    const engine = new RecoveryEngine()
    const pendingCalls = new Map()
    pendingCalls.set(0, {
      id: 'call_1',
      name: 'test_func',
      arguments: '{"key": "value"',
      index: 0,
      confidence: 0,
      startTime: Date.now(),
    })

    const error = new ToolStreamError('Parse error', 'PARSE_ERROR', true)
    const result = engine.attempt(pendingCalls, error)

    expect(result.recovered).toBe(true)
    expect(result.strategy).toBe(RecoveryStrategy.REPAIR_JSON)
    expect(result.toolCalls.length).toBeGreaterThan(0)
    expect(result.toolCalls[0].name).toBe('test_func')
  })

  it('should force reset after too many consecutive errors', () => {
    const engine = new RecoveryEngine()
    const pendingCalls = new Map()
    pendingCalls.set(0, {
      id: 'call_1',
      name: 'test_func',
      arguments: '{"key": "value"}',
      index: 0,
      confidence: 0,
      startTime: Date.now(),
    })

    const error = new ToolStreamError('Error', 'UNKNOWN', true)
    let result
    for (let i = 0; i < 5; i++) {
      result = engine.attempt(pendingCalls, error)
    }

    expect(result!.strategy).toBe(RecoveryStrategy.FORCE_COMPLETE)
    expect(result!.toolCalls.length).toBeGreaterThan(0)
  })

  it('should skip chunk for unknown errors initially', () => {
    const engine = new RecoveryEngine()
    const pendingCalls = new Map()

    const error = new ToolStreamError('Unknown error', 'UNKNOWN', true)
    const result = engine.attempt(pendingCalls, error)

    expect(result.strategy).toBe(RecoveryStrategy.SKIP_CHUNK)
    expect(result.recovered).toBe(false)
  })

  it('should track consecutive errors', () => {
    const engine = new RecoveryEngine()
    const pendingCalls = new Map()
    const error = new ToolStreamError('Error', 'UNKNOWN', true)

    expect(engine.getConsecutiveErrors()).toBe(0)

    engine.attempt(pendingCalls, error)
    expect(engine.getConsecutiveErrors()).toBe(1)

    engine.attempt(pendingCalls, error)
    expect(engine.getConsecutiveErrors()).toBe(2)
  })

  it('should reset error count', () => {
    const engine = new RecoveryEngine()
    const pendingCalls = new Map()
    const error = new ToolStreamError('Error', 'UNKNOWN', true)

    engine.attempt(pendingCalls, error)
    expect(engine.getConsecutiveErrors()).toBe(1)

    engine.reset()
    expect(engine.getConsecutiveErrors()).toBe(0)
  })

  it('should log errors for inspection', () => {
    const engine = new RecoveryEngine()
    const pendingCalls = new Map()
    const error = new ToolStreamError('Test error', 'PARSE_ERROR', true, 'context')

    expect(engine.getErrorLog()).toHaveLength(0)

    engine.attempt(pendingCalls, error)
    expect(engine.getErrorLog()).toHaveLength(1)
    expect(engine.getErrorLog()[0].message).toBe('Test error')
  })
})
