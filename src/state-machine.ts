import { StateMachineState, type PendingToolCall } from './types.js'
import { JsonStreamParser } from './json-stream.js'

export interface MachineContext {
  currentToolCall: PendingToolCall | null
  toolCalls: Map<number, PendingToolCall>
  argumentsDepth: number
  inString: boolean
  jsonParser: JsonStreamParser
  providerDetected: boolean
}

export function createMachineContext(): MachineContext {
  return {
    currentToolCall: null,
    toolCalls: new Map(),
    argumentsDepth: 0,
    inString: false,
    jsonParser: new JsonStreamParser(),
    providerDetected: false,
  }
}

export class ToolCallStateMachine {
  private state: StateMachineState = StateMachineState.Idle
  private context: MachineContext
  private buffer: string = ''
  private escapeNext: boolean = false

  constructor() {
    this.context = createMachineContext()
  }

  getState(): StateMachineState {
    return this.state
  }

  getContext(): MachineContext {
    return this.context
  }

  feed(char: string): void {
    this.buffer += char
    this.processChar(char)
  }

  feedChunk(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      this.feed(chunk[i])
    }
  }

  private processChar(char: string): void {
    switch (this.state) {
      case StateMachineState.Idle: this.processIdle(char); break
      case StateMachineState.Text: this.processText(char); break
      case StateMachineState.PossibleTool: this.processPossibleTool(char); break
      case StateMachineState.ToolName: this.processToolName(char); break
      case StateMachineState.Arguments: this.processArguments(char); break
      case StateMachineState.Json: this.processJson(char); break
      case StateMachineState.Escape: this.processEscape(char); break
      case StateMachineState.Completed: this.processCompleted(char); break
      case StateMachineState.Error: break
    }
  }

  private processIdle(char: string): void {
    if (char === '{') {
      this.state = StateMachineState.PossibleTool
      this.buffer = char
    } else if (char === '<') {
      this.state = StateMachineState.PossibleTool
      this.buffer = char
    }
  }

  private processText(_char: string): void {
    this.state = StateMachineState.Idle
  }

  private processPossibleTool(char: string): void {
    const ctx = this.buffer
    if (ctx.includes('tool_calls') || ctx.includes('function') ||
        ctx.includes('tool_use') || ctx.includes('functionCall') ||
        ctx.includes('tool_call>')) {
      this.state = StateMachineState.ToolName
      this.context.currentToolCall = {
        id: undefined,
        provider: null,
        name: undefined,
        arguments: '',
        index: 0,
        confidence: 0,
        startTime: Date.now(),
        repaired: false,
      }
      this.context.toolCalls.set(0, this.context.currentToolCall)
      this.reprocessChar(char)
    } else if (char === '}') {
      this.state = StateMachineState.Text
    }
  }

  private processToolName(char: string): void {
    if (this.context.currentToolCall && (char === '{' || char === '<')) {
      this.state = StateMachineState.Arguments
      this.context.argumentsDepth = 1
      this.context.jsonParser.reset()
      this.context.jsonParser.feed(char)
    }
  }

  private processArguments(char: string): void {
    this.state = StateMachineState.Json
    this.context.jsonParser.feed(char)
    this.processJsonDepth(char)
  }

  private processJson(char: string): void {
    this.context.jsonParser.feed(char)
    this.processJsonDepth(char)
  }

  private processJsonDepth(char: string): void {
    if (char === '\\' && !this.escapeNext) {
      this.escapeNext = true
      return
    }
    if (this.escapeNext) {
      this.escapeNext = false
      return
    }
    if (char === '{') this.context.argumentsDepth++
    if (char === '}') {
      this.context.argumentsDepth--
      if (this.context.argumentsDepth <= 0) {
        this.state = StateMachineState.Completed
      }
    }
    if (char === '[') this.context.argumentsDepth++
    if (char === ']') this.context.argumentsDepth--
  }

  private processEscape(_char: string): void {
    this.state = StateMachineState.Json
  }

  private processCompleted(_char: string): void {
    this.context.currentToolCall = null
    this.state = StateMachineState.Idle
    this.buffer = ''
    this.context.providerDetected = false
  }

  private reprocessChar(char: string): void {
    if (char === '{' || char === '<') {
      this.state = StateMachineState.Arguments
      this.context.argumentsDepth = 1
      this.context.jsonParser.reset()
      this.context.jsonParser.feed(char)
    }
  }

  reset(): void {
    this.state = StateMachineState.Idle
    this.buffer = ''
    this.escapeNext = false
    this.context = createMachineContext()
  }
}
