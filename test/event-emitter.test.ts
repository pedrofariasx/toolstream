import { describe, it, expect, vi } from 'vitest'
import { ToolStreamEmitter } from '../src/event-emitter.js'

describe('ToolStreamEmitter', () => {
  it('should register and emit events', () => {
    const emitter = new ToolStreamEmitter()
    const handler = vi.fn()

    emitter.on('toolDetected', handler)
    emitter.emitSync('toolDetected', { id: undefined, provider: null, name: undefined, arguments: '', index: 0, confidence: 0, startTime: Date.now(), repaired: false })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should support once listeners', () => {
    const emitter = new ToolStreamEmitter()
    const handler = vi.fn()

    emitter.once('toolCompleted', handler)
    emitter.emitSync('toolCompleted', { id: '1', provider: null, name: 'fn', arguments: {}, raw: '', index: 0, confidence: 1, repaired: false })
    emitter.emitSync('toolCompleted', { id: '2', provider: null, name: 'fn2', arguments: {}, raw: '', index: 1, confidence: 1, repaired: false })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should remove listeners', () => {
    const emitter = new ToolStreamEmitter()
    const handler = vi.fn()

    emitter.on('error', handler)
    emitter.off('error', handler)
    emitter.emitSync('error', new Error('test'))

    expect(handler).not.toHaveBeenCalled()
  })

  it('should count listeners', () => {
    const emitter = new ToolStreamEmitter()
    expect(emitter.listenerCount('drain')).toBe(0)

    emitter.on('drain', () => {})
    expect(emitter.listenerCount('drain')).toBe(1)

    emitter.once('drain', () => {})
    expect(emitter.listenerCount('drain')).toBe(2)
  })

  it('should remove all listeners', () => {
    const emitter = new ToolStreamEmitter()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('error', h1)
    emitter.on('drain', h2)
    emitter.removeAllListeners()

    emitter.emitSync('error', new Error('test'))
    emitter.emitSync('drain')
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('should handle async listeners via emitAsync', async () => {
    const emitter = new ToolStreamEmitter()
    let resolved = false

    emitter.on('drain', async () => {
      await new Promise(r => setTimeout(r, 10))
      resolved = true
    })

    await emitter.emitAsync('drain')
    expect(resolved).toBe(true)
  })

  it('should not throw when emitting event with no listeners', () => {
    const emitter = new ToolStreamEmitter()
    expect(() => {
      emitter.emitSync('drain')
    }).not.toThrow()
  })
})
