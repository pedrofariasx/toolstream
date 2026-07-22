import { describe, it, expect } from 'vitest'
import { ToolStream } from '../src/tool-parser.js'
import { openaiChunks, anthropicChunks, geminiChunks } from './fixtures/streaming-chunks.js'

describe('Integration Tests', () => {
  it('should handle full lifecycle: create -> push chunks -> finalize -> reset -> reuse', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    for (const chunk of openaiChunks.singleStreaming) {
      parser.push(chunk)
    }

    const firstBatch = parser.finalize()
    expect(firstBatch).toHaveLength(1)
    expect(firstBatch[0].name).toBe('search_docs')

    parser.reset()

    for (const chunk of openaiChunks.parallelToolCalls.slice(0, 4)) {
      parser.push(chunk)
    }

    const secondBatch = parser.finalize()
    expect(secondBatch.length).toBeGreaterThanOrEqual(1)
  })

  it('should handle multiple provider formats in sequence (reset between)', () => {
    const openai = new ToolStream({ provider: 'openai', autoDetectProvider: false })
    for (const chunk of openaiChunks.singleStreaming) {
      openai.push(chunk)
    }
    const openaiResult = openai.finalize()
    expect(openaiResult[0].name).toBe('search_docs')

    openai.reset()
    openai.setProvider('anthropic')
    for (const chunk of anthropicChunks.streaming) {
      openai.push(chunk)
    }
    const anthropicResult = openai.finalize()
    expect(anthropicResult[0].name).toBe('get_weather')

    openai.reset()
    openai.setProvider('gemini')
    for (const chunk of geminiChunks.streaming) {
      openai.push(chunk)
    }
    const geminiResult = openai.finalize()
    expect(geminiResult[0].name).toBe('get_weather')
  })

  it('should emit drain on finalize', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })
    let drained = false

    parser.on('drain', () => { drained = true })
    parser.finalize()

    expect(drained).toBe(true)
  })

  it('should handle very large streaming sequence', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    const manyChunks = []
    manyChunks.push(openaiChunks.singleStreaming[0])
    for (let i = 0; i < 100; i++) {
      manyChunks.push(openaiChunks.singleStreaming[1])
    }
    manyChunks.push(openaiChunks.singleStreaming[2])
    manyChunks.push(openaiChunks.singleStreaming[3])

    for (const chunk of manyChunks) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
  })

  it('should handle interleaved text and tool calls', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    const mixedChunks = [
      `{"choices":[{"delta":{"role":"assistant","content":"Let me look that up for you."}}]}`,
      `{"choices":[{"delta":{"content":" "}}]}`,
      openaiChunks.singleStreaming[0],
      openaiChunks.singleStreaming[1],
      openaiChunks.singleStreaming[2],
      openaiChunks.singleStreaming[3],
    ]

    for (const chunk of mixedChunks) {
      parser.push(chunk)
    }

    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('search_docs')
  })

  it('should provide normalized calls', () => {
    const parser = new ToolStream({
      provider: 'openai',
      autoDetectProvider: false,
    })

    for (const chunk of openaiChunks.singleStreaming) {
      parser.push(chunk)
    }

    const normalized = parser.getNormalizedCalls()
    const completed = parser.finalize()
    const normalizedAfter = parser.getNormalizedCalls()
    expect(completed).toHaveLength(1)
    expect(normalizedAfter).toHaveLength(1)
  })

  it('should handle empty string pushes gracefully', () => {
    const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

    parser.push('')
    parser.push('  ')
    parser.push('')
    expect(parser.getChunkCount()).toBe(0)

    parser.push(openaiChunks.singleStreaming[0])
    expect(parser.getChunkCount()).toBe(1)
  })
})
