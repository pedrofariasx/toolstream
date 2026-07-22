import type { PendingToolCall, CompletedToolCall } from './types.js'
import { ToolStreamError } from './types.js'
import { JsonRepairer } from './json-stream.js'

export enum RecoveryStrategy {
  SKIP_CHUNK = 'skip-chunk',
  RESET_PARSER = 'reset-parser',
  REPAIR_JSON = 'repair-json',
  FORCE_COMPLETE = 'force-complete',
  RESYNC = 'resync',
}

export interface RecoveryResult {
  recovered: boolean
  strategy: RecoveryStrategy
  toolCalls: CompletedToolCall[]
  errors: RecoveryError[]
  action: string
}

interface RecoveryError {
  message: string
  offset: number
}

export class RecoveryEngine {
  private consecutiveErrors: number = 0
  private maxConsecutiveErrors: number = 5
  private errorLog: RecoveryError[] = []

  attempt(pendingCalls: Map<number, PendingToolCall>, error: ToolStreamError): RecoveryResult {
    this.consecutiveErrors++
    this.errorLog.push({ message: error.message, offset: 0 })

    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      return this.forceReset(pendingCalls)
    }

    if (error.code === 'PARSE_ERROR') {
      return this.repairJson(pendingCalls)
    }

    if (error.code === 'INVALID_CHAR' || error.code === 'UNEXPECTED_TOKEN') {
      return this.resync(pendingCalls)
    }

    return this.skipChunk(pendingCalls)
  }

  private forceReset(pendingCalls: Map<number, PendingToolCall>): RecoveryResult {
    const toolCalls: CompletedToolCall[] = []
    const errors: RecoveryError[] = []

    for (const [, call] of pendingCalls) {
      if (call.name) {
        try {
          const repaired = JsonRepairer.repair(call.arguments)
          const args = repaired ? JSON.parse(repaired.repaired) : {}
      toolCalls.push({
              id: `recovered_${call.index}`,
              provider: call.provider ?? null,
              name: call.name,
              arguments: args as Record<string, unknown>,
              raw: call.arguments,
              index: call.index,
              confidence: 0.5,
              repaired: true,
            })
        } catch {
          errors.push({
            message: `Failed to recover tool call "${call.name}"`,
            offset: 0,
          })
        }
      }
    }

    this.consecutiveErrors = 0
    this.errorLog = []

    return {
      recovered: toolCalls.length > 0,
      strategy: RecoveryStrategy.FORCE_COMPLETE,
      toolCalls,
      errors,
      action: `Force completed ${toolCalls.length} tool calls after ${this.consecutiveErrors} consecutive errors`,
    }
  }

  private repairJson(pendingCalls: Map<number, PendingToolCall>): RecoveryResult {
    const toolCalls: CompletedToolCall[] = []
    const errors: RecoveryError[] = []

    for (const [, call] of pendingCalls) {
      if (call.name && call.arguments.length > 0) {
        try {
          const repaired = JsonRepairer.repair(call.arguments)
          if (repaired) {
            const parsed = JSON.parse(repaired.repaired)
            toolCalls.push({
              id: `repaired_${call.index}`,
              provider: call.provider ?? null,
              name: call.name,
              arguments: parsed as Record<string, unknown>,
              raw: call.arguments,
              index: call.index,
              confidence: repaired?.confidence ?? 0.5,
              repaired: true,
            })
          }
        } catch {
          const e: RecoveryError = {
            message: `Failed to repair arguments for "${call.name}"`,
            offset: 0,
          }
          errors.push(e)
        }
      }
    }

    this.consecutiveErrors = 0

    return {
      recovered: toolCalls.length > 0,
      strategy: RecoveryStrategy.REPAIR_JSON,
      toolCalls,
      errors,
      action: `Repaired ${toolCalls.length} tool calls via JSON repair`,
    }
  }

  private resync(_pendingCalls: Map<number, PendingToolCall>): RecoveryResult {
    return {
      recovered: false,
      strategy: RecoveryStrategy.RESYNC,
      toolCalls: [],
      errors: [],
      action: 'Attempting to resync parser state',
    }
  }

  private skipChunk(_pendingCalls: Map<number, PendingToolCall>): RecoveryResult {
    return {
      recovered: false,
      strategy: RecoveryStrategy.SKIP_CHUNK,
      toolCalls: [],
      errors: [],
      action: 'Skipping current chunk and waiting for valid input',
    }
  }

  reset(): void {
    this.consecutiveErrors = 0
    this.errorLog = []
  }

  getConsecutiveErrors(): number {
    return this.consecutiveErrors
  }

  getErrorLog(): RecoveryError[] {
    return [...this.errorLog]
  }
}
