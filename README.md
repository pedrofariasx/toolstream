# ToolStream

**Parser incremental de tool calls para LLMs em streaming.** Inspirado em llhttp e tree-sitter, o ToolStream é uma biblioteca framework-agnostic para parsear tool calls de LLMs em tempo real, com suporte a múltiplos provedores e execução antecipada.

## Features

- **Streaming first**: Aceita chunks arbitrários via `parser.push(chunk)` e constrói tool calls incrementalmente
- **Multi-provedor**: OpenAI, Anthropic, Gemini, DeepSeek, Qwen, XML e formatos customizados
- **Partial JSON**: Tolerância a JSON parcial/incompleto com reparo inteligente
- **Event-driven**: Emite eventos durante toda a construção dos argumentos
- **Early execution**: Permite executar ferramentas antes da resposta completa quando a confiança é suficiente
- **Error recovery**: Estratégias de recuperação para chunks malformados
- **Framework-agnostic**: Compatível com Node.js, Bun, Deno, Browser e Cloudflare Workers
- **Zero dependências**: Apenas TypeScript

## Instalação

```bash
npm install toolstream
```

## Uso Básico

```typescript
import { ToolStream } from 'toolstream'

const parser = new ToolStream({ provider: 'openai' })

parser.on('tool-call:complete', (toolCall) => {
  console.log(`Tool: ${toolCall.name}`, toolCall.arguments)
})

// Streaming chunks da OpenAI
for await (const chunk of stream) {
  parser.push(chunk)
}

parser.finalize()
```

## Arquitetura

```
Tokenizar → State Machine → Parser → Recovery → Eventos
    ↓                            ↓
  Chunks                    Provider Adapters
                               ↓
                          OpenAI · Anthropic · Gemini · DeepSeek · Qwen · XML
```

- **StreamDecoder**: Gerencia o buffer de entrada e quebra em tokens
- **StateMachine**: DFA que rastreia o estado do parsing
- **JsonStreamParser**: Parseia JSON incrementalmente
- **RecoveryEngine**: Estratégias de recuperação de erros
- **ConfidenceScorer**: Avalia confiança para early execution

## Provedores

```typescript
// Auto-detecção (detecta automaticamente o formato)
const parser = new ToolStream({ autoDetectProvider: true })

// Provedor explícito
const parser = new ToolStream({ provider: 'anthropic' })
const parser = new ToolStream({ provider: 'gemini' })
const parser = new ToolStream({ provider: 'deepseek' })
const parser = new ToolStream({ provider: 'qwen' })
const parser = new ToolStream({ provider: 'xml' })

// Adapter customizado
parser.setCustomAdapter({
  name: 'custom',
  processChunk: function* (chunk) { /* ... */ },
  detect: (chunk) => chunk.includes('my-format'),
})
```

## Eventos

| Evento | Descrição |
|--------|-----------|
| `tool-call:start` | Nova tool call detectada |
| `tool-call:id` | ID da tool call identificado |
| `tool-call:name` | Nome da função identificado |
| `tool-call:arguments:delta` | Delta dos argumentos parciais |
| `tool-call:arguments:key` | Chave de argumento parseada |
| `tool-call:arguments:value` | Valor de argumento parseado |
| `tool-call:arguments:partial` | Objeto parcial dos argumentos |
| `tool-call:early-execute` | Pronto para execução antecipada |
| `tool-call:complete` | Tool call completamente parseada |
| `tool-call:error` | Erro durante parsing |

## Early Execution

```typescript
const parser = new ToolStream({
  provider: 'openai',
  earlyExecutionThreshold: 0.85 // confiança mínima
})

parser.on('tool-call:early-execute', (toolCall) => {
  // Executa a ferramenta com argumentos parciais
  executeTool(toolCall.name, toolCall.partialArguments)
})
```

## Documentação

A documentação completa da API está em [`docs/api.md`](docs/api.md).

## Benchmarks

```bash
npm run bench     # Executa suite de benchmarks
```

## Testes

```bash
npm test          # Executa testes (vitest)
npm run test:watch  # Modo watch
npm run test:coverage # Cobertura
```

## Build

```bash
npm run build     # Gera dist/ com ESM, CJS e DTS
```

## CI

O projeto usa GitHub Actions para:

- Type checking (`tsc --noEmit`)
- Testes unitários (Node 18, 20, 22)
- Build (ESM + CJS + DTS)
- Benchmarks automáticos no `main`

## Licença

MIT
