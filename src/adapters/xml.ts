import { BaseAdapter } from './base.js'
import type { NormalizedDelta, ProviderName } from '../types.js'

interface XmlToolState {
  index: number
  currentTag: string | undefined
  id: string | undefined
  name: string | undefined
  arguments: string
  inParameters: boolean
  paramKey: string | undefined
  paramValue: string
  textBuffer: string
}

export class XmlAdapter extends BaseAdapter {
  readonly name: ProviderName = 'xml'
  private state: XmlToolState = {
    index: 0,
    currentTag: undefined,
    id: undefined,
    name: undefined,
    arguments: '',
    inParameters: false,
    paramKey: undefined,
    paramValue: '',
    textBuffer: '',
  }
  private inToolCall: boolean = false
  private inTag: boolean = false
  private tagName: string = ''

  processChunk(chunk: string): Generator<NormalizedDelta> {
    return this.parseChunk(chunk)
  }

  detect(chunk: string): boolean {
    return chunk.includes('<tool_call>') || chunk.includes('<tool_call')
  }

  private *parseChunk(chunk: string): Generator<NormalizedDelta> {
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i]

      if (char === '<' && !this.inTag) {
        yield* this.flushText()
        this.inTag = true
        this.tagName = ''
        continue
      }

      if (this.inTag) {
        if (char === '>') {
          this.inTag = false
          const results = this.handleTag(this.tagName)
          if (results) yield* results
          continue
        }
        if (char === '/') {
          this.tagName += '/'
          continue
        }
        this.tagName += char
        continue
      }

      if (this.inToolCall && !this.inTag) {
        this.state.textBuffer += char
      }
    }
  }

  private *flushText(): Generator<NormalizedDelta> {
    const text = this.state.textBuffer.trim()
    this.state.textBuffer = ''
    if (!text || !this.inToolCall) return

    const tag = this.state.currentTag
    if (tag === 'tool_name') {
      this.state.name = text
    } else if (this.state.inParameters && this.state.paramKey) {
      this.state.arguments += `"${this.state.paramKey}": "${text.replace(/"/g, '\\"')}", `
      this.state.paramKey = undefined
    }
  }

  private handleTag(tag: string): NormalizedDelta[] | null {
    const isClosing = tag.startsWith('/')
    const tagName = isClosing ? tag.slice(1) : tag.trim()

    if (tagName === 'tool_call') {
      if (isClosing) {
        const results: NormalizedDelta[] = []
        if (this.state.name) {
          const argsJson = this.buildArgsJson()
          results.push(this.createToolDetected(this.state.index))
          if (this.state.id) results.push(this.createToolId(this.state.id, this.state.index))
          results.push(this.createToolName(this.state.name, this.state.index))
          results.push(this.createArgumentsDelta(argsJson, this.state.index))
          results.push(this.createToolStop(this.state.index))
        }
        this.inToolCall = false
        this.state = {
          index: this.state.index + 1,
          currentTag: undefined,
          id: undefined,
          name: undefined,
          arguments: '',
          inParameters: false,
          paramKey: undefined,
          paramValue: '',
          textBuffer: '',
        }
        return results.length > 0 ? results : null
      }
      this.inToolCall = true
      return null
    }

    if (!this.inToolCall) return null

    if (tagName === 'tool_name' && !isClosing) {
      this.state.currentTag = 'tool_name'
      return null
    }

    if (tagName === 'tool_name' && isClosing) {
      this.state.currentTag = undefined
      return null
    }

    if (tagName === 'parameters' && !isClosing) {
      this.state.inParameters = true
      return null
    }

    if (tagName === 'parameters' && isClosing) {
      this.state.inParameters = false
      return null
    }

    if (this.state.inParameters && !isClosing) {
      this.state.paramKey = tagName
      this.state.paramValue = ''
      this.state.currentTag = tagName
      return null
    }

    if (this.state.inParameters && isClosing) {
      this.state.currentTag = undefined
      return null
    }

    return null
  }

  private buildArgsJson(): string {
    return `{ ${this.state.arguments.replace(/, $/, '')} }`
  }

  reset(): void {
    super.reset()
    this.state = {
      index: 0,
      currentTag: undefined,
      id: undefined,
      name: undefined,
      arguments: '',
      inParameters: false,
      paramKey: undefined,
      paramValue: '',
      textBuffer: '',
    }
    this.inToolCall = false
    this.inTag = false
    this.tagName = ''
  }
}
