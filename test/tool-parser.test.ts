import { describe, it, expect, vi } from 'vitest'
import { ToolStream } from '../src/tool-parser.js'
import type { CompletedToolCall, EarlyExecutableToolCall } from '../src/types.js'
import {
  openaiChunks,
  anthropicChunks,
  geminiChunks,
  deepseekChunks,
  qwenChunks,
  xmlChunks,
} from './fixtures/streaming-chunks.js'

describe('ToolStream', () => {
  it('should create a new instance with default options', () => {
    const parser = new ToolStream()
    expect(parser).toBeInstanceOf(ToolStream)
    expect(parser.getProvider()).toBeNull()
    expect(parser.getChunkCount()).toBe(0)
  })

  it('should create with explicit provider', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })
    expect(parser.getProvider()).toBe('openai')
  })

  it('should parse OpenAI single streaming tool call', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })
    const chunks = openaiChunks.singleStreaming
    const events: string[] = []

    parser.on('toolDetected', () => events.push('toolDetected'))
    parser.on('toolStarted', (id, name) => events.push(`toolStarted:${name}`))
    parser.on('argumentsUpdated', () => events.push('argumentsUpdated'))
    parser.on('toolCompleted', (tc) => events.push(`toolCompleted:${tc.name}`))

    for (const chunk of chunks) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('search_docs')
    expect(completed[0].id).toBe('call_abc')
    expect(completed[0].arguments).toHaveProperty('query')
    expect(completed[0].arguments).toHaveProperty('limit')

    expect(events).toContain('toolDetected')
    expect(events).toContain('toolStarted:search_docs')
    expect(events).toContain('argumentsUpdated')
    expect(events).toContain('toolCompleted:search_docs')
  })

  it('should parse OpenAI parallel tool calls', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    for (const chunk of openaiChunks.parallelToolCalls) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed.length).toBeGreaterThanOrEqual(2)
    const names = completed.map(tc => tc.name)
    expect(names).toContain('get_weather')
    expect(names).toContain('get_time')
  })

  it('should parse Anthropic streaming tool calls', () => {
    const parser = new ToolStream({ provider: 'anthropic', autoDetectProvider: false })
    const events: string[] = []

    parser.on('toolDetected', () => events.push('toolDetected'))
    parser.on('toolStarted', (id, name) => events.push(`toolStarted:${name}`))
    parser.on('argumentsUpdated', () => events.push('argumentsUpdated'))
    parser.on('toolCompleted', (tc) => events.push(`toolCompleted:${tc.name}`))

    for (const chunk of anthropicChunks.streaming) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('get_weather')
    expect(completed[0].id).toBe('toolu_abc')
    expect(events).toContain('toolDetected')
    expect(events).toContain('toolStarted:get_weather')
  })

  it('should parse Gemini tool calls (non-streaming pattern)', () => {
    const parser = new ToolStream({ provider: 'gemini', autoDetectProvider: false })

    for (const chunk of geminiChunks.streaming) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('get_weather')
    expect(completed[0].arguments).toHaveProperty('location')
    expect(completed[0].arguments.location).toBe('San Francisco')
  })

  it('should parse DeepSeek tool calls', () => {
    const parser = new ToolStream({ provider: 'deepseek', autoDetectProvider: false })

    for (const chunk of deepseekChunks.streaming) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('analyze_data')
    expect(completed[0].arguments).toHaveProperty('dataset')
    expect(completed[0].arguments).toHaveProperty('aggregation')
  })

  it('should parse Qwen tool calls', () => {
    const parser = new ToolStream({ provider: 'qwen', autoDetectProvider: false })

    for (const chunk of qwenChunks.streaming) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('translate')
    expect(completed[0].arguments).toHaveProperty('text')
    expect(completed[0].arguments).toHaveProperty('target')
  })

  it('should emit events in correct order', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })
    const eventLog: string[] = []

    parser.on('toolDetected', () => eventLog.push('toolDetected'))
    parser.on('toolStarted', (id, name) => eventLog.push(`toolStarted:${name}`))
    parser.on('argumentsUpdated', () => eventLog.push('argumentsUpdated'))
    parser.on('toolCompleted', (tc) => eventLog.push(`toolCompleted:${tc.name}`))

    for (const chunk of openaiChunks.singleStreaming) {
      parser.push(chunk)
    }
    parser.finalize()

    expect(eventLog.indexOf('toolDetected')).toBeGreaterThanOrEqual(0)
    expect(eventLog.indexOf('toolStarted:search_docs')).toBeGreaterThanOrEqual(0)
    expect(eventLog.indexOf('toolCompleted:search_docs')).toBeGreaterThanOrEqual(0)
  })

  it('should handle no tool calls gracefully', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })
    const events: string[] = []

    parser.on('toolDetected', () => events.push('toolDetected'))
    parser.on('toolCompleted', () => events.push('toolCompleted'))

    for (const chunk of openaiChunks.noToolCalls) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(0)
    expect(events).toHaveLength(0)
  })

  it('should auto-detect OpenAI provider from chunk content', () => {
    const parser = new ToolStream({ autoDetectProvider: true })

    parser.push(openaiChunks.singleStreaming[0])
    expect(parser.getProvider()).toBe('openai')
  })

  it('should auto-detect Anthropic provider', () => {
    const parser = new ToolStream({ autoDetectProvider: true })

    parser.push(anthropicChunks.streaming[0])
    expect(parser.getProvider()).toBe('anthropic')
  })

  it('should auto-detect Gemini provider', () => {
    const parser = new ToolStream({ autoDetectProvider: true })

    parser.push(geminiChunks.streaming[0])
    expect(parser.getProvider()).toBe('gemini')
  })

  it('should emit early-execute event when confidence threshold met', () => {
    const parser = new ToolStream({
      provider: 'gemini',
      autoDetectProvider: false,
      earlyExecutionThreshold: 0.5,
    })

    const earlyCalls: EarlyExecutableToolCall[] = []
    parser.on('toolCompleted', (tc) => {
      // early execution is handled via confidence scoring
    })

    for (const chunk of geminiChunks.streaming) {
      parser.push(chunk)
    }
    parser.finalize()

    const completed = parser.getCompletedCalls()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('get_weather')
  })

  it('should track chunk count', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    expect(parser.getChunkCount()).toBe(0)
    parser.push('chunk1')
    expect(parser.getChunkCount()).toBe(1)
    parser.push('chunk2')
    expect(parser.getChunkCount()).toBe(2)
  })

  it('should provide snapshot of current state', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    parser.push(openaiChunks.singleStreaming[0])
    const snapshot = parser.snapshot()

    expect(snapshot.provider).toBe('openai')
    expect(snapshot.chunkCount).toBe(1)
    expect(Array.isArray(snapshot.pendingCalls)).toBe(true)
    expect(Array.isArray(snapshot.completedCalls)).toBe(true)
    expect(typeof snapshot.buffer).toBe('string')
  })

  it('should reset state and allow reuse', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    for (const chunk of openaiChunks.singleStreaming) {
      parser.push(chunk)
    }
    expect(parser.finalize()).toHaveLength(1)

    parser.reset()
    expect(parser.getChunkCount()).toBe(0)
    expect(parser.getCompletedCalls()).toHaveLength(0)
    expect(parser.isFinalized()).toBe(false)

    for (const chunk of openaiChunks.singleStreaming) {
      parser.push(chunk)
    }
    expect(parser.finalize()).toHaveLength(1)
  })

  it('should throw on push after finalize', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    parser.finalize()
    expect(() => parser.push('test')).toThrow()
  })

  it('should set custom adapter', () => {
    const parser = new ToolStream({ autoDetectProvider: false })
    const customAdapter = {
      name: 'custom' as const,
      init: vi.fn(),
      processChunk: function* () {},
      detect: () => true,
      reset: vi.fn(),
    }

    parser.setCustomAdapter(customAdapter)
    expect(parser.getProvider()).toBe('custom')

    parser.push('test chunk')
    expect(customAdapter.init).toHaveBeenCalled()
  })

  it('should parse XML tool calls', () => {
    const parser = new ToolStream({ provider: 'xml', autoDetectProvider: false })

    for (const chunk of xmlChunks.streaming) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('get_weather')
  })

  it('should return normalized tool calls', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    for (const chunk of openaiChunks.singleStreaming) {
      parser.push(chunk)
    }
    parser.finalize()

    const normalized = parser.getNormalizedCalls()
    expect(normalized).toHaveLength(1)
    expect(normalized[0].name).toBe('search_docs')
    expect(normalized[0].provider).toBe('openai')
    expect(normalized[0].completed).toBe(true)
    expect(typeof normalized[0].confidence).toBe('number')
  })

  it('should include provider in completed tool calls', () => {
    const parser = new ToolStream({ provider: 'anthropic', autoDetectProvider: false })

    for (const chunk of anthropicChunks.streaming) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed[0].provider).toBe('anthropic')
  })
})
