# ToolStream API Reference

## ToolStream

The main parser class. Event-driven, streaming-first, provider-agnostic.

### Constructor

```ts
new ToolStream(options?: ToolStreamOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoDetectProvider` | `boolean` | `true` | Auto-detect provider from chunk content |
| `provider` | `ProviderName` | `'openai'` | Explicit provider (used when autoDetect=false) |
| `customAdapter` | `ProviderAdapter` | — | Custom adapter instance |
| `earlyExecutionThreshold` | `number` | `0.85` | Confidence threshold for early execution (0-1) |
| `maxBufferSize` | `number` | `1048576` | Max internal buffer size in bytes |

### push(chunk)

```ts
parser.push(chunk: string): this
```

Feed a chunk into the parser. Accepts partial data; the parser incrementally reconstructs tool calls.

**Edge cases:**
- Empty strings are silently ignored
- Whitespace-only strings are silently ignored
- Throws `ToolStreamError` if called after `finalize()`
- Non-tool content (plain text) is passed through without errors

### finalize()

```ts
parser.finalize(): CompletedToolCall[]
```

Signal that no more chunks will arrive. Completes all pending tool calls and returns completed ones. After `finalize()`, the parser cannot accept more chunks unless `reset()` is called.

### Events

```ts
parser.on('token', (type: string, value: string) => void)
parser.on('toolDetected', (pending: PendingToolCall) => void)
parser.on('toolStarted', (id: string, name: string, index: number) => void)
parser.on('toolUpdated', (toolCall: PendingToolCall) => void)
parser.on('argumentsUpdated', (delta: string, partial: object, index: number) => void)
parser.on('jsonUpdated', (parsed: object, index: number) => void)
parser.on('normalized', (toolCall: NormalizedToolCall) => void)
parser.on('toolCompleted', (toolCall: CompletedToolCall) => void)
parser.on('repair', (original: string, repaired: string, index?: number) => void)
parser.on('error', (error: ToolStreamError) => void)
parser.on('stateChanged', (state: string) => void)
parser.on('drain', () => void)
```

**Event ordering guarantee:**

```
token → toolDetected → toolStarted → toolUpdated → argumentsUpdated
  → jsonUpdated → normalized → toolCompleted → drain
```

### snapshot()

```ts
parser.snapshot(): ToolStreamSnapshot
```

Returns the current parser state: pending calls, completed calls, buffer, state machine state, provider, and chunk count. Also emits a `snapshot` event.

### getNormalizedCalls()

```ts
parser.getNormalizedCalls(): NormalizedToolCall[]
```

Returns all completed tool calls in normalized (provider-agnostic) format.

### reset()

```ts
parser.reset(): void
```

Resets the parser to initial state. Clears all state including pending/completed calls, buffer, provider detection, and listeners.

### setProvider(provider)

```ts
parser.setProvider(provider: ProviderName): void
```

Manually sets the provider adapter.

### setCustomAdapter(adapter)

```ts
parser.setCustomAdapter(adapter: ProviderAdapter): void
```

Registers and activates a custom provider adapter.

---

## ProviderAdapter

Interface for implementing custom providers.

```ts
interface ProviderAdapter {
  readonly name: ProviderName
  init(options?: Record<string, unknown>): void
  processChunk(chunk: string): Generator<NormalizedDelta>
  detect(chunk: string): boolean
  reset(): void
}
```

### Example: Custom adapter

```ts
class MyAdapter extends BaseAdapter {
  readonly name = 'custom' as const

  detect(chunk: string): boolean {
    return chunk.includes('my-tool')
  }

  *processChunk(chunk: string): Generator<NormalizedDelta> {
    if (chunk.includes('my-tool')) {
      yield this.createToolDetected(0)
      yield this.createToolName('my_function', 0)
      if (chunk.includes('args:')) {
        const args = chunk.split('args:')[1].trim()
        yield this.createArgumentsDelta(args, 0)
      }
      yield this.createToolStop(0)
    }
  }
}

parser.setCustomAdapter(new MyAdapter())
```

---

## NormalizedToolCall

Provider-agnostic tool call representation.

```ts
interface NormalizedToolCall {
  id: string
  provider: ProviderName | null
  name: string
  arguments: Record<string, unknown>
  raw: string
  index: number
  completed: boolean
  confidence: number
  repaired: boolean
}
```

---

## Error Types

```ts
class ToolStreamError extends Error {
  code: string
  recoverable: boolean
  context?: string
}

class ParseError extends ToolStreamError    // code: 'PARSE_ERROR'
class RecoveryError extends ToolStreamError  // code: 'RECOVERY_FAILED'
```

---

## Streaming Examples

### OpenAI (SSE streaming)

```ts
const parser = new ToolStream({ autoDetectProvider: true })

for await (const chunk of response.body) {
  parser.push(new TextDecoder().decode(chunk))
}

const tools = parser.finalize()
```

### Anthropic (streaming events)

```ts
const parser = new ToolStream({ provider: 'anthropic' })

for await (const event of stream) {
  parser.push(JSON.stringify(event))
}

const tools = parser.finalize()
```

### Early execution (partial arguments)

```ts
const parser = new ToolStream({
  provider: 'openai',
  earlyExecutionThreshold: 0.7
})

parser.on('toolStarted', (id, name) => {
  // Start UI updates immediately
  showToolRunning(name)
})

parser.on('argumentsUpdated', (delta, partial) => {
  // Update live preview as arguments arrive
  updatePreview(partial)
})

parser.on('toolCompleted', (tool) => {
  // Full tool call ready for execution
  executeTool(tool.name, tool.arguments)
})
```

### Debugging with snapshot

```ts
parser.on('token', (type, value) => {
  debugLog(`[${type}] ${value}`)
})

// Inspect state at any point
const state = parser.snapshot()
console.log('Pending:', state.pendingCalls.length)
console.log('Buffer size:', state.buffer.length)
console.log('State machine:', state.state)
```
