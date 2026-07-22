import { ToolStream } from '../src/tool-parser.js'
import { JsonStreamParser, JsonRepairer } from '../src/json-stream.js'

function makeOpenAIChunk(name: string, args: string): string {
  return `{"choices":[{"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_bench","type":"function","function":{"name":"${name}","arguments":"${args.replace(/"/g, '\\"')}"}}]}}]}`
}

function makeLargeArgs(size: number): string {
  const pairs: string[] = []
  for (let i = 0; i < size; i++) {
    pairs.push(`"key${i}": "value${i}"`)
  }
  return `{${pairs.join(',')}}`
}

function nano(): [number, number] {
  const h = process.hrtime()
  return [h[0], h[1]]
}

function diff(start: [number, number]): number {
  const end = process.hrtime()
  return (end[0] - start[0]) * 1e9 + (end[1] - start[1])
}

function formatNs(ns: number): string {
  if (ns > 1e9) return `${(ns / 1e9).toFixed(2)}s`
  if (ns > 1e6) return `${(ns / 1e6).toFixed(2)}ms`
  if (ns > 1e3) return `${(ns / 1e3).toFixed(2)}µs`
  return `${ns.toFixed(0)}ns`
}

function throughput(bytes: number, ns: number): string {
  const seconds = ns / 1e9
  const mb = bytes / (1024 * 1024)
  return `${(mb / seconds).toFixed(2)} MB/s`
}

async function run() {
  console.log('ToolStream Benchmark Suite')
  console.log('=' .repeat(60))
  console.log()

  // 1. Single tool call throughput
  console.log('1. Single tool call throughput')
  const singleChunk = makeOpenAIChunk('get_weather', '{"location":"San Francisco","unit":"celsius"}')
  const bytes = singleChunk.length
  const parser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

  const start = nano()
  const iterations = 10000
  for (let i = 0; i < iterations; i++) {
    parser.push(singleChunk)
    parser.reset()
  }
  const elapsed = diff(start)
  const perOp = elapsed / iterations
  console.log(`  ${iterations} iterations in ${formatNs(elapsed)}`)
  console.log(`  ${formatNs(perOp)} per push + reset`)
  console.log(`  ${throughput(bytes * iterations, elapsed)}`)
  console.log()

  // 2. Streaming tool call (multiple chunks)
  console.log('2. Streaming tool call (5 chunks)')
  const chunks = [
    makeOpenAIChunk('search', ''),
    makeOpenAIChunk('search', '{"qu'),
    makeOpenAIChunk('search', 'ery": "hello world"'),
    makeOpenAIChunk('search', ', "limit": 10}'),
  ]
  const streamBytes = chunks.reduce((s, c) => s + c.length, 0)
  const streamParser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

  const sStart = nano()
  const sIterations = 5000
  for (let i = 0; i < sIterations; i++) {
    for (const chunk of chunks) {
      streamParser.push(chunk)
    }
    streamParser.reset()
  }
  const sElapsed = diff(sStart)
  const sPerSequence = sElapsed / sIterations
  console.log(`  ${sIterations} sequences in ${formatNs(sElapsed)}`)
  console.log(`  ${formatNs(sPerSequence)} per sequence (${chunks.length} chunks)`)
  console.log(`  ${throughput(streamBytes * sIterations, sElapsed)}`)
  console.log()

  // 3. Large argument parsing
  console.log('3. Large arguments (100 keys)')
  const largeArgs = makeLargeArgs(100)
  const largeChunk = makeOpenAIChunk('big_func', largeArgs)
  const largeParser = new ToolStream({ provider: 'openai', autoDetectProvider: false })

  const lStart = nano()
  const lIterations = 1000
  for (let i = 0; i < lIterations; i++) {
    largeParser.push(largeChunk)
    largeParser.reset()
  }
  const lElapsed = diff(lStart)
  console.log(`  ${lIterations} iterations in ${formatNs(lElapsed)}`)
  console.log(`  ${formatNs(lElapsed / lIterations)} per iteration`)
  console.log(`  Arguments size: ${largeArgs.length} bytes`)
  console.log()

  // 4. JSON partial parsing
  console.log('4. JSON streaming parser')
  const jsonParser = new JsonStreamParser()
  const jsonChunks = [
    '{"key": "value", "nested": {"a": 1, "b": [1,2,3,4,5]',
    ', "c": "more data", "d": true, "e": null}',
    ', "final": "done"}',
  ]
  const jsonBytes = jsonChunks.reduce((s, c) => s + c.length, 0)

  const jStart = nano()
  const jIterations = 10000
  for (let i = 0; i < jIterations; i++) {
    for (const c of jsonChunks) {
      jsonParser.feed(c)
    }
    jsonParser.getBestEffortValue()
    jsonParser.reset()
  }
  const jElapsed = diff(jStart)
  console.log(`  ${jIterations} iterations in ${formatNs(jElapsed)}`)
  console.log(`  ${formatNs(jElapsed / jIterations)} per parse`)
  console.log(`  ${throughput(jsonBytes * jIterations, jElapsed)}`)
  console.log()

  // 5. JSON repair
  console.log('5. JSON repair (partial JSON)')
  const partials = [
    '{"key": "value"',
    '{"items": [1, 2, 3',
    '{"a": 1, "b": 2,}',
    '{key: "value"}',
  ]

  const rStart = nano()
  const rIterations = 50000
  let rCount = 0
  for (let i = 0; i < rIterations; i++) {
    for (const p of partials) {
      const result = JsonRepairer.repair(p)
      if (result) rCount++
    }
  }
  const rElapsed = diff(rStart)
  console.log(`  ${rIterations * partials.length} repairs in ${formatNs(rElapsed)}`)
  console.log(`  ${formatNs(rElapsed / (rIterations * partials.length))} per repair`)
  console.log()

  // 6. Provider auto-detection
  console.log('6. Provider auto-detection')
  const providers = [
    { name: 'OpenAI', chunk: '{"choices":[{"delta":{"tool_calls":[]}}]}' },
    { name: 'Anthropic', chunk: '{"type":"content_block_start","content_block":{"type":"tool_use"}}' },
    { name: 'Gemini', chunk: '[{"candidates":[{"content":{"parts":[{"functionCall":{}}]}}]}]' },
  ]

  const dStart = nano()
  const dIterations = 10000
  for (let i = 0; i < dIterations; i++) {
    for (const p of providers) {
      const detect = new ToolStream({ autoDetectProvider: true })
      detect.push(p.chunk)
    }
  }
  const dElapsed = diff(dStart)
  console.log(`  ${dIterations * providers.length} detections in ${formatNs(dElapsed)}`)
  console.log(`  ${formatNs(dElapsed / (dIterations * providers.length))} per detection`)
  console.log()

  console.log('=' .repeat(60))
  console.log('Done.')
}

run().catch(console.error)
