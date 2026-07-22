import type { ProviderName, ProviderAdapter } from '../types.js'
import { OpenAIAdapter } from './openai.js'
import { AnthropicAdapter } from './anthropic.js'
import { GeminiAdapter } from './gemini.js'
import { DeepSeekAdapter } from './deepseek.js'
import { QwenAdapter } from './qwen.js'
import { XmlAdapter } from './xml.js'
import { MarkdownAdapter } from './markdown.js'

class AdapterRegistry {
  private adapters: Map<ProviderName, ProviderAdapter> = new Map()
  private customAdapters: ProviderAdapter[] = []

  constructor() {
    this.register(new OpenAIAdapter())
    this.register(new AnthropicAdapter())
    this.register(new GeminiAdapter())
    this.register(new DeepSeekAdapter())
    this.register(new QwenAdapter())
    this.register(new XmlAdapter())
    this.register(new MarkdownAdapter())
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name, adapter)
  }

  registerCustom(adapter: ProviderAdapter): void {
    this.customAdapters.push(adapter)
    this.adapters.set(adapter.name, adapter)
  }

  get(name: ProviderName): ProviderAdapter | undefined {
    return this.adapters.get(name)
  }

  detect(chunk: string): ProviderAdapter | null {
    for (const [, adapter] of this.adapters) {
      if (adapter.detect(chunk)) {
        return adapter
      }
    }
    for (const adapter of this.customAdapters) {
      if (adapter.detect(chunk)) {
        return adapter
      }
    }
    return null
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values())
  }

  reset(): void {
    for (const [, adapter] of this.adapters) {
      adapter.reset()
    }
  }
}

export const adapterRegistry = new AdapterRegistry()
