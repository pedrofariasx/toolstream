import { describe, expect, it } from "vitest"
import { JsonRepairer, JsonStreamParser } from "../src/json-stream.js"
import { partialJsonExamples } from "./fixtures/streaming-chunks.js"

describe("JsonStreamParser", () => {
	it("should parse complete JSON object", () => {
		const parser = new JsonStreamParser()
		parser.feed('{"key": "value"}')
		const result = parser.getBestEffortValue()
		expect(result.value).toEqual({ key: "value" })
		expect(result.partial).toBe(false)
	})

	it("should parse complete JSON array", () => {
		const parser = new JsonStreamParser()
		parser.feed("[1, 2, 3]")
		const result = parser.getBestEffortValue()
		expect(result.value).toEqual([1, 2, 3])
		expect(result.partial).toBe(false)
	})

	it("should handle incremental feeding", () => {
		const parser = new JsonStreamParser()
		parser.feed('{"a"')
		parser.feed(': 1, "b"')
		parser.feed(": 2}")
		const result = parser.getBestEffortValue()
		expect(result.value).toEqual({ a: 1, b: 2 })
	})

	it("should provide best-effort JSON for incomplete object", () => {
		const parser = new JsonStreamParser()
		parser.feed(partialJsonExamples.incompleteObject)
		const repaired = parser.getBestEffort()
		expect(() => JSON.parse(repaired)).not.toThrow()
	})

	it("should handle empty object", () => {
		const parser = new JsonStreamParser()
		parser.feed(partialJsonExamples.emptyObject)
		const result = parser.getBestEffortValue()
		expect(result.value).toEqual({})
	})

	it("should handle complex nested incomplete JSON", () => {
		const parser = new JsonStreamParser()
		parser.feed(partialJsonExamples.complexPartial)
		const result = parser.getBestEffortValue()
		expect(result.value).toBeDefined()
		expect(typeof result.value).toBe("object")
	})

	it("should provide state info", () => {
		const parser = new JsonStreamParser()
		parser.feed('{"a":')
		const state = parser.getState()
		expect(state.depth).toBeGreaterThanOrEqual(0)
		expect(state.partial).toBe(true)
	})

	it("should reset correctly", () => {
		const parser = new JsonStreamParser()
		parser.feed('{"key": "value"}')
		parser.reset()
		const state = parser.getState()
		expect(state.depth).toBe(0)
		expect(state.partial).toBe(true)
	})

	it("should parse strings with escape sequences", () => {
		const parser = new JsonStreamParser()
		parser.feed('{"msg": "hello\\nworld"}')
		const result = parser.getBestEffortValue()
		expect(result.value).toEqual({ msg: "hello\nworld" })
	})

	it("should handle booleans and null", () => {
		const parser = new JsonStreamParser()
		parser.feed('{"a": true, "b": false, "c": null}')
		const result = parser.getBestEffortValue()
		expect(result.value).toEqual({ a: true, b: false, c: null })
	})

	it("should handle numbers including negatives and floats", () => {
		const parser = new JsonStreamParser()
		parser.feed('{"int": 42, "neg": -10, "float": 3.14, "exp": 1e5}')
		const result = parser.getBestEffortValue()
		expect(result.value).toEqual({ int: 42, neg: -10, float: 3.14, exp: 100000 })
	})
})

describe("JsonRepairer", () => {
	it("should fix trailing comma in object", () => {
		const result = JsonRepairer.repair(partialJsonExamples.trailingComma)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
	})

	it("should fix unquoted keys", () => {
		const result = JsonRepairer.repair(partialJsonExamples.unquotedKey)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
		const parsed = JSON.parse(result!.repaired)
		expect(parsed.key).toBe("value")
	})

	it("should fix single quotes", () => {
		const result = JsonRepairer.repair(partialJsonExamples.singleQuotes)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
		const parsed = JSON.parse(result!.repaired)
		expect(parsed.key).toBe("value")
	})

	it("should fix trailing decimal", () => {
		const result = JsonRepairer.repair(partialJsonExamples.trailingDecimal)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
		const parsed = JSON.parse(result!.repaired)
		expect(parsed.pi).toBe(3.0)
	})

	it("should fix incomplete object by closing braces", () => {
		const result = JsonRepairer.repair(partialJsonExamples.incompleteObject)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
		const parsed = JSON.parse(result!.repaired)
		expect(parsed.key).toBe("value")
	})

	it("should fix deeply nested incomplete JSON", () => {
		const result = JsonRepairer.repair(partialJsonExamples.deeplyNested)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
	})

	it("should return null for already valid JSON", () => {
		const result = JsonRepairer.repair('{"valid": "json"}')
		expect(result).toBeNull()
	})

	it("should fix incomplete string by adding closing brace", () => {
		const result = JsonRepairer.repair(partialJsonExamples.incompleteString)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
	})

	it("should fix incomplete array", () => {
		const result = JsonRepairer.repair(partialJsonExamples.incompleteArray)
		expect(result).not.toBeNull()
		expect(() => JSON.parse(result!.repaired)).not.toThrow()
		const parsed = JSON.parse(result!.repaired)
		expect(parsed.items).toEqual([1, 2, 3])
	})
})
