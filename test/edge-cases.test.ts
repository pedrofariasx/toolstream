import { describe, expect, it } from "vitest"
import { FunctionTagAdapter } from "../src/adapters/functiontag.js"
import { JsonStreamParser } from "../src/json-stream.js"
import { Tokenizer } from "../src/tokenizer.js"
import { ToolStream } from "../src/tool-parser.js"
import { TokenType } from "../src/types.js"

function sseChunk(name: string, argsJson: string) {
	const escaped = JSON.stringify(argsJson)
	return `{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":${JSON.stringify(name)},"arguments":${escaped}}}]}}]}`
}

// =========================================================================
// 1. JsonStreamParser — partial JSON at every structural boundary
// =========================================================================
describe("Partial JSON — structural truncation", () => {
	const cases = [
		"{",
		'{"',
		'{"my_ke',
		'{"key"',
		'{"key":',
		'{"key": ',
		'{"key": "hello_wo',
		'{"key": "hello"',
		'{"a": 1,',
		'{"a": 1, "',
		'{"a": 1, "b"',
		'{"a": 12',
		'{"a": 3.',
		'{"a": 3.14',
		'{"a": -',
		'{"a": tr',
		'{"a": fal',
		'{"a": nu',
		'{"a": true',
		'{"a": false',
		'{"a": null',
		'{"a": [',
		'{"a": [1, 2,',
		'{"a": {"b": 1',
		'{"a": {"b": {"c": {"d": {"e": 1}}',
		'{"a": {"b": 1}}',
	]
	for (const input of cases) {
		const label = input.length > 20 ? `${input.slice(0, 20)}…` : input
		it(`recovers from "${label}"`, () => {
			const j = new JsonStreamParser()
			j.feed(input)
			const r = j.getBestEffortValue()
			expect(r.value).toBeDefined()
		})
	}
})

// =========================================================================
// 2. JsonStreamParser — streaming splits at every position
// =========================================================================
describe("Streaming — every split (JsonStreamParser)", () => {
	const cases: [string, string, any][] = [
		["single kv", '{"key": "value"}', { key: "value" }],
		["empty obj", "{}", {}],
		["multi keys", '{"a": 1, "b": true, "c": "hello"}', { a: 1, b: true, c: "hello" }],
		["nested array", '{"items": [1, 2, 3, 4, 5]}', { items: [1, 2, 3, 4, 5] }],
		["nested obj", '{"outer": {"inner": {"deep": "val"}}}', { outer: { inner: { deep: "val" } } }],
		["string spaces", '{"text": "hello world"}', { text: "hello world" }],
		["numbers", '{"int": 42, "neg": -10, "f": 3.14}', { int: 42, neg: -10, f: 3.14 }],
		["null bool", '{"a": null, "b": true, "c": false}', { a: null, b: true, c: false }],
	]
	for (const [label, json, expected] of cases) {
		it(label, () => {
			for (let split = 1; split <= Math.min(json.length, 7); split++) {
				const j = new JsonStreamParser()
				for (let i = 0; i < json.length; i += split) j.feed(json.slice(i, i + split))
				expect(j.getBestEffortValue().value).toEqual(expected)
			}
		})
	}
})

// =========================================================================
// 3. JsonRepairer — malformed JSON fixes
// =========================================================================
describe("JSON Repair", () => {
	const cases: [string, string, any][] = [
		["trailing comma obj", '{"a": 1, "b": 2,}', { a: 1, b: 2 }],
		["trailing comma arr", '{"items": [1, 2, 3,]}', { items: [1, 2, 3] }],
		["missing close brace", '{"key": "value"', { key: "value" }],
		["missing close nested", '{"outer": {"inner": "val"', { outer: { inner: "val" } }],
		["missing braces+ brackets", '{"items": [1, 2', {}],
		["comma before close", '{"a": 1,}', { a: 1 }],
		["empty key", '{"": "empty_key"}', { "": "empty_key" }],
		["single quote keys", "{'a': 1}", { a: 1 }],
	]
	for (const [label, input, expected] of cases) {
		it(label, () => {
			const j = new JsonStreamParser()
			j.feed(input)
			const r = j.getBestEffortValue()
			expect(r.value).toEqual(expected)
		})
	}
})

// =========================================================================
// 4. Special characters in JSON strings
// =========================================================================
describe("Special characters in JSON", () => {
	const cases: [string, string, string, any][] = [
		["newline", JSON.stringify({ text: "a\nb" }), "text", "a\nb"],
		["tab", JSON.stringify({ text: "a\tb" }), "text", "a\tb"],
		["quotes", JSON.stringify({ text: 'say "hi"' }), "text", 'say "hi"'],
		["backslash", JSON.stringify({ path: "a\\b" }), "path", "a\\b"],
		["braces", JSON.stringify({ code: "if(x){return}" }), "code", "if(x){return}"],
		["brackets", JSON.stringify({ arr: "a[1]" }), "arr", "a[1]"],
		["unicode á", '{"t": "\\u00e1"}', "t", "á"],
		["unicode ñ", '{"t": "ma\\u00f1ana"}', "t", "mañana"],
		["emoji surrogate", '{"i": "\\uD83D\\uDE00"}', "i", "\uD83D\uDE00"],
		["null char", '{"d": "\\u0000"}', "d", "\0"],
	]
	for (const [label, argsJson, key, expected] of cases) {
		it(label, () => {
			const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
			p.push(sseChunk("fn", argsJson))
			expect(p.finalize()[0].arguments[key]).toBe(expected)
		})
	}
})

// =========================================================================
// 5. Numeric edge cases
// =========================================================================
describe("Numeric edge cases", () => {
	const cases: [string, number][] = [
		["zero", 0],
		["negative zero", 0],
		["max safe", 9007199254740991],
		["min safe", -9007199254740991],
		["sci positive", 1.5e10],
		["sci negative", 1.5e-10],
		["tiny decimal", 0.0000001],
		["pi", Math.PI],
	]
	for (const [label, n] of cases) {
		it(label, () => {
			const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
			p.push(sseChunk("fn", JSON.stringify({ n })))
			const args = p.finalize()[0].arguments as Record<string, unknown>
			expect(args.n).toBe(n)
		})
	}
})

// =========================================================================
// 6. Deeply nested structures
// =========================================================================
describe("Deeply nested", () => {
	it("10 levels deep", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		const obj = { l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { l10: "deep" } } } } } } } } } }
		p.push(sseChunk("fn", JSON.stringify(obj)))
		const args = p.finalize()[0].arguments as Record<string, unknown>
		const l1 = args.l1 as Record<string, unknown>
		const l2 = l1.l2 as Record<string, unknown>
		const l3 = l2.l3 as Record<string, unknown>
		const l4 = l3.l4 as Record<string, unknown>
		const l5 = l4.l5 as Record<string, unknown>
		const l6 = l5.l6 as Record<string, unknown>
		const l7 = l6.l7 as Record<string, unknown>
		const l8 = l7.l8 as Record<string, unknown>
		const l9 = l8.l9 as Record<string, unknown>
		expect(l9.l10).toBe("deep")
	})
	it("array of objects", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(sseChunk("fn", JSON.stringify({ items: [{ a: 1 }, { b: 2 }] })))
		const args = p.finalize()[0].arguments as Record<string, unknown>
		expect(args.items as unknown[]).toHaveLength(2)
	})
	it("1000 keys", () => {
		const obj: Record<string, number> = {}
		for (let i = 0; i < 1000; i++) obj[`k${i}`] = i
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(sseChunk("fn", JSON.stringify(obj)))
		expect(Object.keys(p.finalize()[0].arguments)).toHaveLength(1000)
	})
})

// =========================================================================
// 7. FunctionTagAdapter — error scenarios
// =========================================================================
describe("FunctionTagAdapter", () => {
	function tp() {
		const p = new ToolStream()
		p.setCustomAdapter(new FunctionTagAdapter())
		return p
	}

	it("complete XML call", () => {
		const p = tp()
		p.push("<tool_call>\n<function=test>\n<parameter=x>1</parameter>\n</function>\n</tool_call>")
		const call = p.finalize()[0]
		expect((call.arguments as Record<string, unknown>).x).toBe("1")
	})
	it("no </tool_call> still produces call via finalize", () => {
		const p = tp()
		p.push("<tool_call>\n<function=t>\n<parameter=x>1</parameter>\n</function>\n")
		const r = p.finalize()
		expect(r).toHaveLength(1)
		expect(r[0].name).toBe("t")
	})
	it("empty function name produces unnamed call", () => {
		const p = tp()
		p.push("<tool_call>\n<function=>\n<parameter=x>1</parameter>\n</function>\n</tool_call>")
		const r = p.finalize()
		expect(r).toHaveLength(1)
		expect(r[0].name).toMatch(/unknown/)
	})
	it("multiple params", () => {
		const p = tp()
		p.push(
			"<tool_call>\n<function=m>\n<parameter=a>1</parameter>\n<parameter=b>2</parameter>\n</function>\n</tool_call>",
		)
		const args = p.finalize()[0].arguments as Record<string, unknown>
		expect(args).toEqual({ a: "1", b: "2" })
	})
	it("called format", () => {
		const p = tp()
		p.push('[Called search with {"q":"hello"}]')
		const args = p.finalize()[0].arguments as Record<string, unknown>
		expect(args.q).toBe("hello")
	})
	it("called with nested JSON", () => {
		const p = tp()
		p.push('[Called test with {"config":{"a":1}}]')
		const args = p.finalize()[0].arguments as Record<string, unknown>
		expect(args.config).toEqual({ a: 1 })
	})
	it("called with null", () => {
		const p = tp()
		p.push('[Called t with {"x": null}]')
		const args = p.finalize()[0].arguments as Record<string, unknown>
		expect(args.x).toBeNull()
	})
	it("two calls sequential", () => {
		const p = tp()
		p.push("<tool_call>\n<function=a>\n<parameter=x>1</parameter>\n</function>\n</tool_call>")
		p.push("<tool_call>\n<function=b>\n<parameter>x>2</parameter>\n</function>\n</tool_call>")
		expect(p.finalize()).toHaveLength(2)
	})
})

// =========================================================================
// 8. ToolStream — SSE streaming edge cases
// =========================================================================
describe("ToolStream SSE edge cases", () => {
	it("text between tool calls", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(`{"choices":[{"delta":{"content":"hello"}}]}`)
		p.push(sseChunk("fn", JSON.stringify({ x: 1 })))
		p.push(`{"choices":[{"delta":{"content":"world"}}]}`)
		expect(p.finalize()).toHaveLength(1)
	})
	it("two parallel tool calls", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		const c1 = `{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"fn1","arguments":""}},{"index":1,"id":"b","function":{"name":"fn2","arguments":""}}]}}]}`
		p.push(c1)
		p.push(
			`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"x\\":1}"}},{"index":1,"function":{"arguments":"{\\"y\\":2}"}}]}}]}`,
		)
		expect(p.finalize()).toHaveLength(2)
	})
	it("non-JSON between valid chunks", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(sseChunk("fn", JSON.stringify({ x: 1 })))
		p.push("not json")
		expect(p.finalize()).toHaveLength(1)
	})
	it("newlines between chunks", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push("\n\n")
		p.push(sseChunk("fn", JSON.stringify({ x: 1 })))
		p.push("\n\n")
		expect(p.finalize()).toHaveLength(1)
	})
	it("empty string no-ops", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push("")
		p.push("   ")
		expect(p.getChunkCount()).toBe(0)
	})
	it("reset and reuse", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(sseChunk("fn", JSON.stringify({ a: 1 })))
		expect(p.finalize()).toHaveLength(1)
		p.reset()
		p.push(sseChunk("fn", JSON.stringify({ b: 2 })))
		const r2 = p.finalize()
		expect((r2[0].arguments as Record<string, unknown>).b).toBe(2)
	})
	it("big argument (50KB)", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		const big = { data: "x".repeat(50000) }
		p.push(sseChunk("fn", JSON.stringify(big)))
		const args = p.finalize()[0].arguments as Record<string, unknown>
		expect(args.data as string).toHaveLength(50000)
	})
})

// =========================================================================
// 9. Tokenizer edge cases
// =========================================================================
describe("Tokenizer edge cases", () => {
	it("empty produces only EOF", () => {
		const t = new Tokenizer()
		t.feed("")
		expect(t.allTokens()).toHaveLength(1)
		expect(t.allTokens()[0].type).toBe(TokenType.EOF)
	})
	it("whitespace only", () => {
		const t = new Tokenizer()
		t.feed("   \n  ")
		expect(t.next().type).toBe(TokenType.EOF)
	})
	it("unclosed string", () => {
		const t = new Tokenizer()
		t.feed('{"k": "unclosed')
		expect(t.allTokens().some((tk) => tk.type === TokenType.STRING)).toBe(true)
	})
	it("xml tags", () => {
		const t = new Tokenizer()
		t.feed("<tool_call>")
		const tokens = t.allTokens()
		expect(tokens[0].type).toBe(TokenType.TAG_OPEN)
	})
	it("valid JSON token sequence", () => {
		const t = new Tokenizer()
		t.feed('{"a": 1}')
		const types = t.allTokens().map((tk) => tk.type)
		expect(types).toContain(TokenType.OBJECT_START)
		expect(types).toContain(TokenType.STRING)
		expect(types).toContain(TokenType.NUMBER)
		expect(types).toContain(TokenType.OBJECT_END)
		expect(types).toContain(TokenType.EOF)
	})
})

// =========================================================================
// 10. Event emission edge cases
// =========================================================================
describe("Event emission", () => {
	it("toolDetected and toolCompleted fire", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		let det = 0,
			comp = 0
		p.on("toolDetected", () => det++)
		p.on("toolCompleted", () => comp++)
		p.push(sseChunk("fn", "{}"))
		p.finalize()
		expect(det).toBe(1)
		expect(comp).toBe(1)
	})
	it("drain fires on finalize", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		let d = false
		p.on("drain", () => (d = true))
		p.finalize()
		expect(d).toBe(true)
	})
	it("stateChanged fires on detect", () => {
		const p = new ToolStream({ autoDetectProvider: true })
		let s = false
		p.on("stateChanged", () => (s = true))
		p.push('{"choices":[{"delta":{"tool_calls":[]}}]}')
		expect(s).toBe(true)
	})
})

// =========================================================================
// 11. Normalized calls
// =========================================================================
describe("Normalized calls", () => {
	it("includes all fields", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(sseChunk("fn", JSON.stringify({ x: 1 })))
		p.finalize()
		const n = p.getNormalizedCalls()
		expect(n).toHaveLength(1)
		expect(n[0].completed).toBe(true)
		expect(n[0].provider).toBe("openai")
		expect(typeof n[0].confidence).toBe("number")
		expect(typeof n[0].repaired).toBe("boolean")
	})
})

// =========================================================================
// 12. JsonStreamParser — deep partial
// =========================================================================
describe("JsonStreamParser extreme", () => {
	it("extremely deep partial", () => {
		const j = new JsonStreamParser()
		const input = '{"a": {"b": {"c": {"d": {"e": {"f": {"g": {"h": {"i": {"j": {'
		j.feed(input)
		const r = j.getBestEffort()
		expect(() => JSON.parse(r)).not.toThrow()
	})
	it("reset after partial", () => {
		const j = new JsonStreamParser()
		j.feed('{"a": {"b": 1}')
		j.reset()
		j.feed('{"x": 2}')
		expect(j.getBestEffortValue().value).toEqual({ x: 2 })
	})
})

// =========================================================================
// 13. Provider auto-detection
// =========================================================================
describe("Provider auto-detection", () => {
	it("detects OpenAI", () => {
		const p = new ToolStream({ autoDetectProvider: true })
		p.push('{"choices":[{"delta":{"tool_calls":[]}}]}')
		expect(p.getProvider()).toBe("openai")
	})
	it("detects Anthropic", () => {
		const p = new ToolStream({ autoDetectProvider: true })
		p.push('{"type":"content_block_start","content_block":{"type":"tool_use"}}')
		expect(p.getProvider()).toBe("anthropic")
	})
	it("detects Gemini", () => {
		const p = new ToolStream({ autoDetectProvider: true })
		p.push('[{"candidates":[{"content":{"parts":[{"functionCall":{}}]}}]}]')
		expect(p.getProvider()).toBe("gemini")
	})
	it("null for plain text", () => {
		const p = new ToolStream({ autoDetectProvider: true })
		p.push("plain text")
		expect(p.getProvider()).toBeNull()
	})
})

// =========================================================================
// 14. Snapshot
// =========================================================================
describe("Snapshot", () => {
	it("before push", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		const s = p.snapshot()
		expect(s.chunkCount).toBe(0)
		expect(s.pendingCalls).toHaveLength(0)
	})
	it("after tool detection", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(sseChunk("fn", ""))
		const s = p.snapshot()
		expect(s.provider).toBe("openai")
		expect(s.chunkCount).toBe(1)
	})
	it("after finalize", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		p.push(sseChunk("fn", "{}"))
		p.finalize()
		expect(p.snapshot().completedCalls).toHaveLength(1)
	})
	it("emits snapshot event", () => {
		const p = new ToolStream({ provider: "openai", autoDetectProvider: false })
		let emitted = false
		p.on("snapshot", () => (emitted = true))
		p.snapshot()
		expect(emitted).toBe(true)
	})
})
