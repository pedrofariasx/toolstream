import { BaseAdapter } from './base.js'
import type { NormalizedDelta, ProviderName } from '../types.js'

interface ToolCallState {
  index: number
  id: string | undefined
  name: string | undefined
  arguments: string
}

export class OpenAIAdapter extends BaseAdapter {
  readonly name: ProviderName = 'openai'
  private toolCalls: Map<number, ToolCallState> = new Map()

  processChunk(chunk: string): Generator<NormalizedDelta> {
    return this.parseChunk(chunk)
  }

  detect(chunk: string): boolean {
    return chunk.includes('tool_calls') || 
           (chunk.includes('delta') && chunk.includes('function'))
  }

  private *parseChunk(chunk: string): Generator<NormalizedDelta> {
    if (!chunk.trim()) return

    let jsonStr = chunk.trim()
    if (jsonStr.startsWith('data: ')) {
      jsonStr = jsonStr.slice(6)
    }
    if (jsonStr === '[DONE]') return

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return
    }

    const choices = parsed?.choices
    if (!choices?.length) return

    for (const choice of choices) {
      const delta = choice?.delta
      if (!delta) continue

      const toolCalls = delta?.tool_calls
      if (!toolCalls?.length) continue

      for (const tc of toolCalls) {
        const index = tc.index ?? 0
        let state = this.toolCalls.get(index)

        if (tc.id) {
          if (!state) {
            state = { index, id: undefined, name: undefined, arguments: '' }
            this.toolCalls.set(index, state)
          }
          yield this.createToolDetected(index)
          state.id = tc.id
          yield this.createToolId(tc.id, index)
        }

        if (tc.function?.name) {
          if (!state) {
            state = { index, id: undefined, name: undefined, arguments: '' }
            this.toolCalls.set(index, state)
          }
          state.name = tc.function.name
          yield this.createToolName(tc.function.name, index)
        }

        if (tc.function?.arguments) {
          if (!state) {
            state = { index, id: undefined, name: undefined, arguments: '' }
            this.toolCalls.set(index, state)
          }
          state.arguments += tc.function.arguments
          yield this.createArgumentsDelta(tc.function.arguments, index)
        }
      }
    }
  }

  reset(): void {
    super.reset()
    this.toolCalls.clear()
  }
}
