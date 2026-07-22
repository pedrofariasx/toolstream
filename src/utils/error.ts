import { ToolStreamError, ParseError, RecoveryError } from '../types.js'

export { ToolStreamError, ParseError, RecoveryError }

export function createParseError(
  message: string,
  offset: number,
  context?: string,
): ParseError {
  return new ParseError(message, offset, context)
}

export function createRecoveryError(message: string, context?: string): RecoveryError {
  return new RecoveryError(message, context)
}

export function isToolStreamError(error: unknown): error is ToolStreamError {
  return error instanceof ToolStreamError
}
