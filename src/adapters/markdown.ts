import { BaseAdapter } from './base.js'
import type { NormalizedDelta, ProviderName } from '../types.js'

export class MarkdownAdapter extends BaseAdapter {
  readonly name: ProviderName = 'markdown'
  private buffer: string = ''
  private inFencedBlock: boolean = false

  processChunk(chunk: string): Generator<NormalizedDelta> {
    return this.parseChunk(chunk)
  }

  detect(chunk: string): boolean {
    return chunk.includes('```') || 
           chunk.includes('---tool') || 
           chunk.includes('<!-- tool')
  }

  private *parseChunk(chunk: string): Generator<NormalizedDelta> {
    this.buffer += chunk
    const lines = this.buffer.split('\n')

    if (!this.buffer.endsWith('\n')) {
      this.buffer = lines.pop() ?? ''
    } else {
      this.buffer = ''
    }

    for (const line of lines) {
      const trimmed = line.trim()

      const fence = this.detectFence(trimmed)
      if (fence) {
        this.inFencedBlock = !this.inFencedBlock
        continue
      }

      if (this.inFencedBlock) {
        const toolMatch = trimmed.match(/^tool:\s*(\w+)/)
        const argMatch = trimmed.match(/^(\w+):\s*(.+)/)

        if (toolMatch) {
          yield this.createToolDetected(0)
          yield this.createToolName(toolMatch[1], 0)
        } else if (trimmed === '{' || trimmed.startsWith('{')) {
          yield this.createArgumentsDelta(line, 0)
        } else if (argMatch) {
          const jsonArg = `"${argMatch[1]}": "${argMatch[2]}"`
          yield this.createArgumentsDelta(`{${jsonArg}}`, 0)
        }
      }
    }
  }

  private detectFence(line: string): { char: string; count: number } | null {
    const match = line.match(/^(```|~~~)(\w*)$/)
    if (match) return { char: match[1][0], count: match[1].length }
    return null
  }

  reset(): void {
    super.reset()
    this.buffer = ''
    this.inFencedBlock = false
  }
}
