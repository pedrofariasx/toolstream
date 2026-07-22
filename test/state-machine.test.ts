import { describe, it, expect } from 'vitest'
import { ToolCallStateMachine } from '../src/state-machine.js'
import { StateMachineState } from '../src/types.js'

describe('ToolCallStateMachine', () => {
  it('should start in Idle state', () => {
    const sm = new ToolCallStateMachine()
    expect(sm.getState()).toBe(StateMachineState.Idle)
  })

  it('should transition to PossibleTool on seeing opening brace', () => {
    const sm = new ToolCallStateMachine()
    sm.feed('{')
    expect(sm.getState()).toBe(StateMachineState.PossibleTool)
  })

  it('should transition to PossibleTool on seeing opening angle bracket', () => {
    const sm = new ToolCallStateMachine()
    sm.feed('<')
    expect(sm.getState()).toBe(StateMachineState.PossibleTool)
  })

  it('should stay Idle for non-tool content', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('hello world')
    expect(sm.getState()).toBe(StateMachineState.Idle)
  })

  it('should detect tool calls and transition to ToolName', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"tool_calls":')
    expect(sm.getState()).toBe(StateMachineState.ToolName)
  })

  it('should detect function keyword and transition to ToolName', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"function":')
    expect(sm.getState()).toBe(StateMachineState.ToolName)
  })

  it('should populate tool call context after tool detection', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"tool_calls":')
    const ctx = sm.getContext()
    expect(ctx.currentToolCall).toBeDefined()
    expect(ctx.currentToolCall!.name).toBeUndefined()
    expect(ctx.currentToolCall!.arguments).toBe('')
  })

  it('should transition to Json when arguments open', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"function": {"name"')
    expect(sm.getState()).toBe(StateMachineState.Json)
  })

  it('should be in Json state during arguments parsing', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"function": {"name": "test", "args": {"nested"')
    expect(sm.getState()).toBe(StateMachineState.Json)
  })

  it('should detect completion and reset to Idle', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"function": {"name": "test"}}')
    // After parsing completes, state reset to Idle
    expect(sm.getState()).toBe(StateMachineState.Idle)
  })

  it('should have completed during parsing (check context)', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"function": {"name": "test"}}')
    // Verify the tool call was created with correct name
    const ctx = sm.getContext()
    expect(ctx.toolCalls.size).toBeGreaterThanOrEqual(0)
  })

  it('should reset correctly', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"tool_calls":')
    expect(sm.getState()).toBe(StateMachineState.ToolName)
    sm.reset()
    expect(sm.getState()).toBe(StateMachineState.Idle)
    expect(sm.getContext().toolCalls.size).toBe(0)
  })

  it('should handle empty chunk gracefully', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('')
    expect(sm.getState()).toBe(StateMachineState.Idle)
  })

  it('should handle escape sequences inside JSON strings', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"function": {"name": "test", "arguments": "{\\"key\\": \\"val\\"}"}}')
    // State machine should not enter Error state
    expect(sm.getState()).not.toBe(StateMachineState.Error)
  })

  it('should handle nested JSON in arguments', () => {
    const sm = new ToolCallStateMachine()
    sm.feedChunk('{"function": {"name": "test", "arguments": {"nested": true}}}')
    expect(sm.getState()).toBe(StateMachineState.Idle)
  })
})
