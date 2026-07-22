import type {
  NormalizedToolCall,
  PendingToolCall,
  CompletedToolCall,
  ProviderName,
} from './types.js'

export interface NormalizeOptions {
  includeRaw?: boolean
  defaultProvider?: ProviderName | null
}

export class Normalizer {
  private options: Required<NormalizeOptions>

  constructor(options: NormalizeOptions = {}) {
    this.options = {
      includeRaw: true,
      defaultProvider: null,
      ...options,
    }
  }

  normalizeCompleted(completed: CompletedToolCall): NormalizedToolCall {
    return {
      id: completed.id,
      provider: completed.provider ?? this.options.defaultProvider ?? null,
      name: completed.name,
      arguments: completed.arguments,
      raw: this.options.includeRaw ? completed.raw : '',
      index: completed.index,
      completed: true,
      confidence: completed.confidence,
      repaired: completed.repaired,
    }
  }

  normalizePending(pending: PendingToolCall): Partial<NormalizedToolCall> {
    return {
      id: pending.id ?? '',
      provider: pending.provider ?? this.options.defaultProvider ?? null,
      name: pending.name ?? '',
      raw: this.options.includeRaw ? pending.arguments : '',
      index: pending.index,
      completed: false,
      confidence: pending.confidence,
      repaired: pending.repaired,
    }
  }

  normalizeBatch(completed: CompletedToolCall[]): NormalizedToolCall[] {
    return completed.map(tc => this.normalizeCompleted(tc))
  }

  toCanonical(toolCall: NormalizedToolCall): NormalizedToolCall {
    return {
      id: toolCall.id,
      provider: toolCall.provider,
      name: toolCall.name,
      arguments: toolCall.arguments,
      raw: this.options.includeRaw ? toolCall.raw : '',
      index: toolCall.index,
      completed: toolCall.completed,
      confidence: toolCall.confidence,
      repaired: toolCall.repaired,
    }
  }
}
