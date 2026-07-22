import type {
  ProviderAdapter,
  ProviderName,
  NormalizedDelta,
} from '../types.js'

export abstract class BaseAdapter implements ProviderAdapter {
  abstract readonly name: ProviderName
  protected initialized: boolean = false

  init(_options?: Record<string, unknown>): void {
    this.initialized = true
  }

  abstract processChunk(chunk: string): Generator<NormalizedDelta>

  abstract detect(chunk: string): boolean

  reset(): void {
    this.initialized = false
  }

  protected createToolDetected(index: number = 0): NormalizedDelta {
    return { type: 'toolDetected', index }
  }

  protected createToolId(id: string, index: number = 0): NormalizedDelta {
    return { type: 'toolId', id, index }
  }

  protected createToolName(name: string, index: number = 0): NormalizedDelta {
    return { type: 'toolName', name, index }
  }

  protected createArgumentsDelta(args: string, index: number = 0): NormalizedDelta {
    return { type: 'argumentsDelta', arguments: args, index }
  }

  protected createToolStop(index: number = 0): NormalizedDelta {
    return { type: 'toolStop', index }
  }

  protected createText(text: string): NormalizedDelta {
    return { type: 'text', text }
  }
}
