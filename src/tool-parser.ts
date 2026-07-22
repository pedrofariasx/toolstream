import { ToolStreamEmitter } from './event-emitter.js'
import { ToolCallStateMachine } from './state-machine.js'
import { Tokenizer } from './tokenizer.js'
import { JsonStreamParser, JsonRepairer } from './json-stream.js'
import { ConfidenceScorer } from './confidence.js'
import { RecoveryEngine } from './recovery.js'
import { Normalizer } from './normalizer.js'
import { adapterRegistry } from './adapters/registry.js'
import type {
  ProviderName,
  PendingToolCall,
  CompletedToolCall,
  NormalizedToolCall,
  ToolStreamOptions,
  ToolStreamSnapshot,
  ProviderAdapter,
  NormalizedDelta,
} from './types.js'
import {
  ToolStreamError,
  StateMachineState,
  TokenType,
} from './types.js'

export class ToolStream extends ToolStreamEmitter {
  private options: Required<ToolStreamOptions>
  private activeAdapter: ProviderAdapter | null = null
  private customAdapter: ProviderAdapter | null = null
  private tokenizer: Tokenizer = new Tokenizer()
  private stateMachine: ToolCallStateMachine = new ToolCallStateMachine()
  private jsonParser: JsonStreamParser = new JsonStreamParser()
  private confidenceScorer: ConfidenceScorer
  private recoveryEngine: RecoveryEngine = new RecoveryEngine()
  private normalizer: Normalizer = new Normalizer()
  private pendingCalls: Map<number, PendingToolCall> = new Map()
  private completedCalls: CompletedToolCall[] = []
  private normalizedCalls: NormalizedToolCall[] = []
  private buffer: string = ''
  private chunkCount: number = 0
  private provider: ProviderName | null = null
  private finalized: boolean = false

  constructor(options: ToolStreamOptions = {}) {
    super()
    this.options = {
      autoDetectProvider: true,
      provider: 'openai',
      earlyExecutionThreshold: 0.85,
      maxBufferSize: 1024 * 1024,
      environment: 'node',
      ...options,
    } as Required<ToolStreamOptions>

    if (options.customAdapter) {
      this.customAdapter = options.customAdapter
    }

    this.confidenceScorer = new ConfidenceScorer({
      threshold: this.options.earlyExecutionThreshold,
    })

    if (this.options.provider && !this.options.autoDetectProvider) {
      const adapter = adapterRegistry.get(this.options.provider)
      if (adapter) {
        this.activeAdapter = adapter
        this.provider = this.options.provider
        adapter.init()
      }
    }
  }

  push(chunk: string): this {
    if (this.finalized) {
      throw new ToolStreamError(
        'Parser is finalized. Create a new instance or call reset().',
        'FINALIZED',
      )
    }

    if (!chunk || chunk.trim().length === 0) return this

    this.chunkCount++
    this.buffer += chunk

    if (this.buffer.length > this.options.maxBufferSize) {
      this.trimBuffer()
    }

    // Pipeline: Tokenizer → Adapter/StateMachine → Parser → Recovery → Repair → Normalizer → Events
    this.runTokenizer(chunk)

    return this
  }

  private runTokenizer(chunk: string): void {
    this.tokenizer.feed(chunk)

    let token = this.tokenizer.next()
    while (token.type !== TokenType.EOF) {
      this.emitSync('token', token.type, token.value)
      token = this.tokenizer.next()
    }

    this.runAdapter(chunk)
  }

  private runAdapter(chunk: string): void {
    if (this.options.autoDetectProvider && !this.activeAdapter) {
      const detected = adapterRegistry.detect(chunk)
      if (detected) {
        this.activeAdapter = detected
        this.provider = detected.name
        detected.init()
        this.emitSync('stateChanged', detected.name)
      }
    } else if (this.customAdapter && !this.activeAdapter) {
      this.activeAdapter = this.customAdapter
      this.provider = this.customAdapter.name
      this.customAdapter.init()
      this.emitSync('stateChanged', this.customAdapter.name)
    }

    if (this.activeAdapter) {
      this.processWithAdapter(chunk)
    } else {
      this.processRaw(chunk)
    }
  }

  private processWithAdapter(chunk: string): void {
    try {
      const deltas = this.activeAdapter!.processChunk(chunk)
      for (const delta of deltas) {
        this.handleDelta(delta)
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private processRaw(chunk: string): void {
    this.stateMachine.feedChunk(chunk)

    const ctx = this.stateMachine.getContext()
    for (const [, call] of ctx.toolCalls) {
      if (!this.pendingCalls.has(call.index)) {
        call.provider = this.provider
        this.pendingCalls.set(call.index, call)
        this.emitSync('toolDetected', call)
      }

      if (call.name) {
        this.emitSync('toolStarted', call.id ?? '', call.name, call.index)
      }

      if (call.arguments) {
        this.processJsonArguments(call)
      }
    }

    if (this.stateMachine.getState() === StateMachineState.Completed) {
      this.completeToolCalls()
    }
  }

  private handleDelta(delta: NormalizedDelta): void {
    switch (delta.type) {
      case 'toolDetected': {
        const index = delta.index ?? 0
        if (!this.pendingCalls.has(index)) {
          const call: PendingToolCall = {
            id: undefined,
            provider: this.provider,
            name: undefined,
            arguments: '',
            index,
            confidence: 0,
            startTime: Date.now(),
            repaired: false,
          }
          this.pendingCalls.set(index, call)
          this.emitSync('toolDetected', call)
        }
        break
      }
      case 'toolId': {
        const index = delta.index ?? 0
        let call = this.pendingCalls.get(index)
        if (!call) {
          call = { id: undefined, provider: this.provider, name: undefined, arguments: '', index, confidence: 0, startTime: Date.now(), repaired: false }
          this.pendingCalls.set(index, call)
          this.emitSync('toolDetected', call)
        }
        if (delta.id) {
          call.id = delta.id
        }
        break
      }
      case 'toolName': {
        const index = delta.index ?? 0
        let call = this.pendingCalls.get(index)
        if (!call) {
          call = { id: undefined, provider: this.provider, name: undefined, arguments: '', index, confidence: 0, startTime: Date.now(), repaired: false }
          this.pendingCalls.set(index, call)
          this.emitSync('toolDetected', call)
        }
        if (delta.name) {
          call.name = delta.name
          this.jsonParser.reset()
          this.emitSync('toolStarted', call.id ?? '', delta.name, index)
          this.emitSync('toolUpdated', call)
        }
        break
      }
      case 'argumentsDelta': {
        const index = delta.index ?? 0
        const call = this.pendingCalls.get(index)
        if (call && delta.arguments) {
          call.arguments += delta.arguments
          this.emitSync('toolUpdated', call)
          this.processArgumentsDelta(call, delta.arguments)
        }
        break
      }
      case 'toolStop': {
        const index = delta.index ?? 0
        this.completeToolCall(index)
        break
      }
    }
  }

  private processJsonArguments(call: PendingToolCall): void {
    if (!call.arguments || call.arguments.length === 0) return

    try {
      this.jsonParser.reset()
      this.jsonParser.feed(call.arguments)
      const result = this.jsonParser.getBestEffortValue()
      if (result.value && typeof result.value === 'object' && !Array.isArray(result.value)) {
        const partial = result.value as Record<string, unknown>
        this.emitSync('jsonUpdated', partial, call.index)
      }

      call.confidence = this.confidenceScorer.evaluate(call).score
    } catch {
      if (call.arguments.length > 10) {
        try {
          const repaired = JsonRepairer.repair(call.arguments)
          if (repaired) {
            const partial = JSON.parse(repaired.repaired) as Record<string, unknown>
            call.repaired = true
            this.emitSync('repair', call.arguments, repaired.repaired, call.index)
            this.emitSync('jsonUpdated', partial, call.index)
            call.confidence = repaired.confidence
          }
        } catch {}
      }
    }
  }

  private processArgumentsDelta(call: PendingToolCall, delta: string): void {
    if (!delta || delta.length === 0) return
    this.jsonParser.feed(delta)
    try {
      const result = this.jsonParser.getBestEffortValue()
      let partial: Record<string, unknown> = {}
      if (result.value && typeof result.value === 'object' && !Array.isArray(result.value)) {
        partial = result.value as Record<string, unknown>
        this.emitSync('jsonUpdated', partial, call.index)
      }
      this.emitSync('argumentsUpdated', delta, partial, call.index)

      call.confidence = this.confidenceScorer.evaluate(call).score
      this.emitSync('toolUpdated', call)
    } catch {
      // partial JSON in streaming is expected
    }
  }

  private completeToolCall(index: number): void {
    const pending = this.pendingCalls.get(index)
    if (!pending) return

    let parsed: Record<string, unknown> = {}
    let repaired = false
    if (pending.arguments) {
      try {
        parsed = JSON.parse(pending.arguments) as Record<string, unknown>
      } catch {
        try {
          const suggestion = JsonRepairer.repair(pending.arguments)
          if (suggestion) {
            parsed = JSON.parse(suggestion.repaired) as Record<string, unknown>
            repaired = true
            this.emitSync('repair', pending.arguments, suggestion.repaired, index)
          }
        } catch {}
      }
    }

    const completed: CompletedToolCall = {
      id: pending.id ?? `call_${index}`,
      provider: pending.provider ?? this.provider,
      name: pending.name ?? `unknown_${index}`,
      arguments: parsed,
      raw: pending.arguments,
      index,
      confidence: pending.confidence,
      repaired,
    }

    this.completedCalls.push(completed)

    // Normalizer pipeline: normaliza antes de emitir toolCompleted
    const normalized = this.normalizer.normalizeCompleted(completed)
    this.normalizedCalls.push(normalized)
    this.emitSync('normalized', normalized)

    this.pendingCalls.delete(index)
    this.emitSync('toolCompleted', completed)
  }

  private completeToolCalls(): void {
    const indices = Array.from(this.pendingCalls.keys())
    for (const index of indices) {
      this.completeToolCall(index)
    }
    this.stateMachine.reset()
  }

  finalize(): CompletedToolCall[] {
    this.finalized = true
    this.completeAllPending()
    this.emitSync('drain')
    return this.getCompletedCalls()
  }

  private completeAllPending(): void {
    const indices = Array.from(this.pendingCalls.keys())
    for (const index of indices) {
      this.completeToolCall(index)
    }
  }

  private handleError(error: Error): void {
    if (error instanceof ToolStreamError) {
      const result = this.recoveryEngine.attempt(this.pendingCalls, error)
      if (result.recovered) {
        for (const tc of result.toolCalls) {
          this.completedCalls.push(tc)
          const normalized = this.normalizer.normalizeCompleted(tc)
          this.normalizedCalls.push(normalized)
          this.emitSync('normalized', normalized)
          this.emitSync('toolCompleted', tc)
        }
      }
      this.emitSync('error', error)
    } else {
      this.emitSync('error', new ToolStreamError(error.message, 'UNKNOWN'))
    }
  }

  private trimBuffer(): void {
    const maxLen = this.options.maxBufferSize
    if (this.buffer.length > maxLen) {
      this.buffer = this.buffer.slice(-maxLen)
    }
  }

  getPendingCalls(): PendingToolCall[] {
    return Array.from(this.pendingCalls.values())
  }

  getCompletedCalls(): CompletedToolCall[] {
    return [...this.completedCalls]
  }

  getNormalizedCalls(): NormalizedToolCall[] {
    return [...this.normalizedCalls]
  }

  getProvider(): ProviderName | null {
    return this.provider
  }

  getChunkCount(): number {
    return this.chunkCount
  }

  getBufferSize(): number {
    return this.buffer.length
  }

  isFinalized(): boolean {
    return this.finalized
  }

  snapshot(): ToolStreamSnapshot {
    return {
      pendingCalls: this.getPendingCalls(),
      completedCalls: this.getCompletedCalls(),
      buffer: this.buffer,
      state: this.stateMachine.getState(),
      provider: this.provider,
      chunkCount: this.chunkCount,
    }
  }

  setProvider(provider: ProviderName): void {
    const adapter = adapterRegistry.get(provider)
    if (adapter) {
      this.activeAdapter = adapter
      this.provider = provider
      adapter.init()
    }
  }

  setCustomAdapter(adapter: ProviderAdapter): void {
    adapterRegistry.registerCustom(adapter)
    this.activeAdapter = adapter
    this.provider = adapter.name
    adapter.init()
  }

  reset(): void {
    this.activeAdapter = null
    this.tokenizer = new Tokenizer()
    this.stateMachine.reset()
    this.jsonParser.reset()
    this.recoveryEngine.reset()
    this.pendingCalls.clear()
    this.completedCalls = []
    this.normalizedCalls = []
    this.buffer = ''
    this.chunkCount = 0
    this.provider = null
    this.finalized = false
    this.removeAllListeners()

    if (!this.options.autoDetectProvider && this.options.provider) {
      const adapter = adapterRegistry.get(this.options.provider)
      if (adapter) {
        this.activeAdapter = adapter
        this.provider = this.options.provider
        adapter.init()
      }
    }
  }
}
