import { describe, it, expect } from 'vitest'
import { ToolStream } from '../src/tool-parser.js'
import { FunctionTagAdapter } from '../src/adapters/functiontag.js'

function simulateStreamProgress(
  parser: ToolStream,
  fullText: string,
  stepSize: number = 1,
  isFinal: boolean = false,
) {
  const deltas: string[] = []
  let prevCleanLen = 0

  for (let i = stepSize; i <= fullText.length; i += stepSize) {
    const chunk = fullText.slice(i - stepSize, i)
    parser.push(chunk)

    const textEvents: string[] = []
    parser.on('text', (t) => textEvents.push(t))
    // We'll just track via the completed calls after finalize
  }

  if (isFinal) {
    parser.finalize()
  }

  const completed = parser.getCompletedCalls()
  return { completed }
}

describe('Streaming: FunctionTagAdapter (tool_call + [Called])', () => {
  it('should parse XML tool_call arriving incrementally without duplication', () => {
    const full =
      "I'll read the file.<tool_call>\n<function=read_file>\n<parameter=path>/tmp/test.js</parameter>\n</function>\n</tool_call>"

    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())

    for (let i = 1; i <= full.length; i++) {
      parser.push(full.slice(i - 1, i))
    }
    const completed = parser.finalize()

    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('read_file')
    expect(completed[0].arguments.path).toBe('/tmp/test.js')
  })

  it('should parse two XML tool calls arriving incrementally', () => {
    const full =
      "Let me check.<tool_call>\n<function=read_file>\n<parameter=path>/a.js</parameter>\n</function>\n</tool_call>\nThen write.<tool_call>\n<function=write_file>\n<parameter=path>/b.js</parameter>\n<parameter=content>hello</parameter>\n</function>\n</tool_call>"

    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())

    for (let i = 1; i <= full.length; i += 10) {
      parser.push(full.slice(i - 10 < 0 ? 0 : i - 10, i))
    }
    const completed = parser.finalize()

    expect(completed).toHaveLength(2)
    expect(completed[0].name).toBe('read_file')
    expect(completed[1].name).toBe('write_file')
  })

  it('should preserve text between tool calls', () => {
    const full =
      "Before.<tool_call>\n<function=bash>\n<parameter=command>ls</parameter>\n</function>\n</tool_call>\nMiddle text.\n<tool_call>\n<function=bash>\n<parameter=command>pwd</parameter>\n</function>\n</tool_call>\nAfter."

    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())
    const textParts: string[] = []

    parser.on('text', (t) => textParts.push(t))

    for (const chunk of [full]) {
      parser.push(chunk)
    }
    parser.finalize()

    const completed = parser.getCompletedCalls()
    expect(completed).toHaveLength(2)
    expect(completed[0].arguments.command).toBe('ls')
    expect(completed[1].arguments.command).toBe('pwd')
  })

  it('should parse [Called] format arriving incrementally', () => {
    const full = 'Let me search.[Called search with {"query":"hello","limit":10}] Done.'

    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())

    for (let i = 0; i < full.length; i += 5) {
      parser.push(full.slice(i, i + 5))
    }
    const completed = parser.finalize()

    expect(completed).toHaveLength(1)
    expect(completed[0].name).toBe('search')
    expect(completed[0].arguments.query).toBe('hello')
    expect(completed[0].arguments.limit).toBe(10)
  })

  it('should parse [Called] with braces in JSON string value', () => {
    const full = '[Called write_file with {"content":"if (x) { return {a: 1}; }"}]'

    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())

    parser.push(full)
    const completed = parser.finalize()

    expect(completed).toHaveLength(1)
    expect(completed[0].arguments.content).toBe('if (x) { return {a: 1}; }')
  })

  it('should handle large parameter (10KB) in streaming', () => {
    const largeContent = 'x'.repeat(10000)
    const full =
      `<tool_call>\n<function=write_file>\n<parameter=path>/tmp/large.txt</parameter>\n<parameter=content>${largeContent}</parameter>\n</function>\n</tool_call>`

    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())

    for (let i = 0; i < full.length; i += 500) {
      parser.push(full.slice(i, i + 500))
    }
    const completed = parser.finalize()

    expect(completed).toHaveLength(1)
    expect(completed[0].arguments.content).toHaveLength(10000)
  })

  it('should emit events: toolDetected, toolStarted, toolCompleted', () => {
    const full =
      "<tool_call>\n<function=search>\n<parameter=query>hello</parameter>\n</function>\n</tool_call>"

    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())
    const events: string[] = []

    parser.on('toolDetected', () => events.push('toolDetected'))
    parser.on('toolStarted', (id, name) => events.push(`toolStarted:${name}`))
    parser.on('toolCompleted', (tc) => events.push(`toolCompleted:${tc.name}`))

    parser.push(full)
    parser.finalize()

    expect(events).toContain('toolDetected')
    expect(events).toContain('toolStarted:search')
    expect(events).toContain('toolCompleted:search')
  })

  it('should handle empty string pushes gracefully', () => {
    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())

    parser.push('')
    parser.push('   ')
    expect(parser.getChunkCount()).toBe(0)

    parser.push('<tool_call>\n<function=test>\n<parameter=x>1</parameter>\n</function>\n</tool_call>')
    const completed = parser.finalize()
    expect(completed).toHaveLength(1)
  })

  it('should detect provider automatically', () => {
    const parser = new ToolStream({ autoDetectProvider: true })
    expect(parser.getProvider()).toBeNull()

    parser.setCustomAdapter(new FunctionTagAdapter())
    expect(parser.getProvider()).toBe('custom')
  })

  it('should emit toolUpdated during argument streaming', () => {
    const parser = new ToolStream()
    parser.setCustomAdapter(new FunctionTagAdapter())
    let updates = 0

    parser.on('toolUpdated', () => updates++)

    const full = "<tool_call>\n<function=update_test>\n<parameter=key>value</parameter>\n</function>\n</tool_call>"
    for (const c of full) {
      parser.push(c)
    }
    parser.finalize()

    expect(updates).toBeGreaterThan(0)
  })
})
