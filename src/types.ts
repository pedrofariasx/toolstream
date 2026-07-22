export type ToolStreamEnvironment = 'node' | 'bun' | 'deno' | 'browser' | 'cloudflare-workers'

export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'xml'
  | 'markdown'
  | 'custom'

export interface ToolCall {
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

export interface PendingToolCall {
  id: string | undefined
  provider: ProviderName | null
  name: string | undefined
  arguments: string
  index: number
  confidence: number
  startTime: number
  repaired: boolean
}

export interface CompletedToolCall {
  id: string
  provider: ProviderName | null
  name: string
  arguments: Record<string, unknown>
  raw: string
  index: number
  confidence: number
  repaired: boolean
}

export interface EarlyExecutableToolCall {
  id: string | undefined
  name: string
  partialArguments: Record<string, unknown>
  confidence: number
  rawArguments: string
  index: number
}

export interface ToolStreamOptions {
  autoDetectProvider?: boolean
  provider?: ProviderName
  customAdapter?: ProviderAdapter
  earlyExecutionThreshold?: number
  maxBufferSize?: number
  environment?: ToolStreamEnvironment
}

export interface ParseContext {
  buffer: string
  offset: number
  chunkIndex: number
}

export interface NormalizedDelta {
  type:
    | 'toolDetected'
    | 'toolId'
    | 'toolName'
    | 'argumentsDelta'
    | 'toolStop'
    | 'text'
  index?: number
  id?: string
  name?: string
  arguments?: string
  text?: string
}

export interface ProviderAdapter {
  readonly name: ProviderName
  init(options?: Record<string, unknown>): void
  processChunk(chunk: string): Generator<NormalizedDelta>
  detect(chunk: string): boolean
  reset(): void
}

export type EventKind =
  | 'text'
  | 'token'
  | 'toolDetected'
  | 'toolStarted'
  | 'toolUpdated'
  | 'argumentsUpdated'
  | 'jsonUpdated'
  | 'repair'
  | 'normalized'
  | 'toolCompleted'
  | 'error'
  | 'stateChanged'
  | 'drain'

export interface ToolStreamEventMap {
  'text': [text: string]
  'token': [type: string, value: string]
  'toolDetected': [PendingToolCall]
  'toolStarted': [id: string, name: string, index: number]
  'toolUpdated': [toolCall: PendingToolCall]
  'argumentsUpdated': [delta: string, partial: Record<string, unknown>, index: number]
  'jsonUpdated': [parsed: Record<string, unknown>, index: number]
  'repair': [original: string, repaired: string, index: number | undefined]
  'normalized': [toolCall: NormalizedToolCall]
  'toolCompleted': [toolCall: CompletedToolCall]
  'error': [error: ToolStreamError]
  'stateChanged': [state: string]
  'drain': []
}

export type ToolStreamListener<E extends EventKind> = (
  ...args: ToolStreamEventMap[E]
) => void | Promise<void>

export class ToolStreamError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly context?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ToolStreamError'
  }
}

export class ParseError extends ToolStreamError {
  constructor(
    message: string,
    public readonly offset: number,
    context?: string,
    options?: ErrorOptions,
  ) {
    super(message, 'PARSE_ERROR', true, context, options)
    this.name = 'ParseError'
  }
}

export class RecoveryError extends ToolStreamError {
  constructor(message: string, context?: string, options?: ErrorOptions) {
    super(message, 'RECOVERY_FAILED', false, context, options)
    this.name = 'RecoveryError'
  }
}

export enum TokenType {
  OBJECT_START = 'OBJECT_START',
  OBJECT_END = 'OBJECT_END',
  ARRAY_START = 'ARRAY_START',
  ARRAY_END = 'ARRAY_END',
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NULL = 'NULL',
  COLON = 'COLON',
  COMMA = 'COMMA',
  IDENTIFIER = 'IDENTIFIER',
  TAG_OPEN = 'TAG_OPEN',
  TAG_CLOSE = 'TAG_CLOSE',
  TAG_SELF_CLOSE = 'TAG_SELF_CLOSE',
  TAG_NAME = 'TAG_NAME',
  TEXT = 'TEXT',
  EOF = 'EOF',
  INVALID = 'INVALID',
}

export interface Token {
  type: TokenType
  value: string
  offset: number
  length: number
}

export enum StateMachineState {
  Idle = 'Idle',
  Text = 'Text',
  PossibleTool = 'PossibleTool',
  ToolName = 'ToolName',
  Arguments = 'Arguments',
  Json = 'Json',
  Escape = 'Escape',
  Completed = 'Completed',
  Error = 'Error',
}

export interface StreamChunk {
  text: string
  index: number
  timestamp: number
  isFinal: boolean
}

export interface PartialJsonResult {
  value: unknown
  partial: boolean
  depth: number
}

export interface RepairSuggestion {
  original: string
  repaired: string
  changes: RepairChange[]
  confidence: number
}

export interface RepairChange {
  type: 'insert' | 'delete' | 'replace'
  offset: number
  original: string
  replacement: string
}

export interface ConfidenceScore {
  score: number
  factors: ConfidenceFactor[]
  threshold: number
  executable: boolean
}

export interface ConfidenceFactor {
  name: string
  weight: number
  value: number
  description: string
}

export interface NormalizedToolCall {
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

export interface ToolStreamSnapshot {
  pendingCalls: PendingToolCall[]
  completedCalls: CompletedToolCall[]
  buffer: string
  state: StateMachineState
  provider: ProviderName | null
  chunkCount: number
}
