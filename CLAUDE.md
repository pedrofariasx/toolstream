# CLAUDE.md

# ToolStream — Streaming Parsing Engine

## Project Vision

ToolStream is the **first streaming parsing engine for incremental Tool Call processing**, compatible with OpenAI, Anthropic, Gemini, DeepSeek, Qwen, XML, Markdown and any text-based protocol.

Its purpose is to become the standard parsing engine for AI applications, similarly to how **llhttp** became the standard HTTP parser and **tree-sitter** became the standard incremental parser for programming languages.

This is **NOT** an AI framework, **NOT** an Agent Framework, **NOT** an LLM SDK.

This is a low-level infrastructure engine focused exclusively on parsing, reconstructing, validating, repairing and normalizing Tool Calls emitted by LLMs in streaming.

The engine architecture supports future extensions such as:
- Structured response parsing (`response_format`)
- Reasoning event traces
- MCP protocol calls
- Agent-to-agent protocols

The core engine remains the same; only new adapters and normalizers are added.

---

# Core Philosophy

Every architectural decision must follow these principles.

## Streaming First

The parser must never assume the complete response already exists.

Chunks may arrive one byte, one token or one character at a time.

Streaming is the primary use case.

---

## State Machine Driven

Parsing must be deterministic.

Avoid regex-driven parsing.

Prefer explicit state transitions.

The parser should behave like a compiler.

---

## Event Driven

Consumers should react to parsing events.

Example:

```ts
parser.on("toolDetected");

parser.on("argumentsUpdated");

parser.on("toolCompleted");
```

The parser should continuously emit information while parsing.

---

## Provider Agnostic

The core parser must not depend on OpenAI, Anthropic, Gemini or any other provider.

Providers must be implemented as adapters.

---

## Zero Framework Lock-in

The project must work with:

- Node.js
- Bun
- Deno
- Browsers
- Cloudflare Workers

No runtime-specific APIs should exist inside the core package.

---

## High Performance

Performance is one of the primary goals.

Always prefer:

- state machines
- small allocations
- reusable buffers
- incremental parsing

Avoid unnecessary object creation.

Avoid repeated string concatenation.

Avoid regex in hot paths.

---

## Modular Architecture

Every responsibility belongs to one module.

Tokenizer ≠ Parser.

Parser ≠ Recovery.

Recovery ≠ Repair.

Repair ≠ Normalization.

Never mix responsibilities.

---

# Project Goals

The parser must be capable of:

- Incrementally parsing Tool Calls
- Recovering malformed streams
- Repairing incomplete JSON
- Detecting Tool Calls early
- Emitting progressive argument updates
- Normalizing multiple provider formats
- Supporting future providers without modifying the core

---

# Non Goals

The project should NOT:

- Execute tools
- Manage conversations
- Call LLM APIs
- Be an agent framework
- Store chat history
- Perform prompt engineering
- Handle business logic

Only parsing belongs here.

---

# Architecture

```
Stream

↓

Tokenizer

↓

State Machine

↓

Parser

↓

Recovery

↓

Repair

↓

Normalizer

↓

Events
```

Each layer must remain independent.

---

# Packages

```
packages/

core/

tokenizer/

parser/

state-machine/

repair/

normalizer/

events/

adapters/

openai/

anthropic/

gemini/

deepseek/

qwen/

xml/

markdown/

benchmark/

playground/

examples/

docs/
```

Each package should expose a clean public API.

No circular dependencies.

---

# Core API

The API should remain minimal.

```ts
const parser = new ToolParser();

parser.push(chunk);
```

Everything else should be optional.

---

# Event System

Expected events:

```
text

toolDetected

toolStarted

toolUpdated

argumentsUpdated

jsonUpdated

toolCompleted

repair

error

stateChanged
```

Events should be lightweight.

Avoid large payloads whenever possible.

---

# Tokenizer

Tokenizer responsibilities:

- string parsing
- unicode
- escape sequences
- brackets
- braces
- commas
- arrays
- object boundaries

Tokenizer must never understand providers.

It only produces semantic tokens.

Example:

```
OBJECT_START

KEY(name)

STRING(search)

COLON

OBJECT_END
```

---

# State Machine

The parser must be implemented as an explicit finite state machine.

Possible states:

```
Idle

Text

PossibleTool

ToolName

Arguments

Json

Escape

Completed

Error
```

Future states may be added without breaking compatibility.

---

# Recovery Engine

Recovery must tolerate:

- partial chunks
- truncated JSON
- unfinished arrays
- unfinished objects
- unfinished strings
- unexpected EOF

Recovery should never discard information unless absolutely necessary.

---

# Repair Engine

Repair should be conservative.

Possible repairs:

- missing commas
- missing quotes
- missing braces
- missing brackets

Every repair must be marked.

Consumers must know whether the parser repaired data.

---

# Normalization

Every provider should produce the same internal structure.

Example:

```ts
interface ToolCall {
  id;

  provider;

  name;

  arguments;

  completed;

  confidence;

  repaired;

  raw;
}
```

Applications should never care which provider generated the Tool Call.

---

# Adapters

Adapters convert provider-specific formats into semantic parser events.

Examples:

- OpenAI
- Anthropic
- Gemini
- DeepSeek
- Qwen
- XML
- Markdown
- Custom

The parser should support custom adapters.

---

# Performance Rules

Always measure.

Never optimize blindly.

Every optimization must be benchmarked.

Maintain benchmark suites inside the repository.

Performance regressions should fail CI.

---

# Testing

Every parser feature must include tests.

Priority:

- tokenizer
- state machine
- recovery
- repair
- adapters
- normalization

Malformed streams are first-class test cases.

---

# Documentation

Documentation is part of the product.

Every public API must include:

- explanation
- examples
- edge cases
- streaming examples

Examples should be executable.

---

# Playground

A visual playground is part of the roadmap.

The playground should display:

- incoming chunks
- tokenizer output
- parser states
- recovery actions
- repair actions
- emitted events
- normalized Tool Calls

This should become the primary debugging interface.

---

# Code Style

Prefer:

- readability
- explicit state transitions
- small functions
- pure functions whenever possible

Avoid:

- deeply nested logic
- giant classes
- hidden side effects
- magic constants

---

# Performance Budget

Every implementation must respect these constraints:

- **No regex in hot paths**: Tokenizer and state machine must use character-level operations
- **O(n) complexity**: Processing time must scale linearly with input size
- **Deterministic**: Same input always produces same output, same events, same order
- **Maximum allocations per chunk**: Reuse buffers whenever possible; avoid per-character allocation
- **Zero-copy preferred**: Reference input data instead of copying when safe
- **Streaming only**: The engine must never require the complete input to begin processing
- **No recursive parsing**: Use iterative state machines, not recursive descent

Performance regressions should fail CI. Every optimization must be benchmarked.

---

# Compatibility Matrix

Every PR that adds or modifies a provider must update this table.

| Provider | Status | Streaming | Non-Streaming | Auto-Detect |
|----------|--------|-----------|---------------|-------------|
| OpenAI | ✅ Stable | ✅ | ✅ | ✅ |
| Anthropic | ✅ Stable | ✅ | ❌ | ✅ |
| Gemini | ✅ Stable | ❌ | ✅ | ✅ |
| DeepSeek | ✅ Stable | ✅ | ✅ | ✅ |
| Qwen | ✅ Stable | ✅ | ✅ | ✅ |
| XML | ✅ Stable | ✅ | ✅ | ✅ |
| Markdown | 🟡 Beta | ✅ | ✅ | ✅ |
| Mistral | 📋 Planned | | | |
| xAI | 📋 Planned | | | |
| OpenAI Compatible | 📋 Planned | | | |

**Legend**: ✅ Stable, 🟡 Beta, 📋 Planned, ❌ Not applicable

---

# Parser Guarantees

The parser guarantees:

- **Incremental parsing**: Chunks may arrive one byte at a time; the engine always produces correct partial state
- **Deterministic behavior**: Identical input sequences always produce identical event sequences and output
- **Provider independence**: Core engine never depends on any provider format; all formats are adapters
- **Stable event ordering**: Events are emitted in a predictable, documented order
- **Recoverable malformed streams**: Partial JSON, truncated chunks, and unexpected EOF are tolerated without data loss
- **Non-blocking execution**: All operations are synchronous; no microtasks, promises, or I/O
- **Streaming compatibility**: Works in Node.js, Bun, Deno, Browsers, and Cloudflare Workers
- **No hidden state mutations**: Buffer and state are exposed via snapshot() for inspection

---

# Long-Term Vision

ToolStream should become the default parser used by:

- AI SDKs
- Agent Frameworks
- IDE assistants
- OpenAI-compatible servers
- MCP implementations
- Proxy servers
- CLI assistants

The project should solve one problem exceptionally well:

**Incremental Tool Call Parsing for Streaming LLMs.**
