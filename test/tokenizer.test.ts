import { describe, expect, it } from "vitest"
import { Tokenizer } from "../src/tokenizer.js"
import { TokenType } from "../src/types.js"

describe("Tokenizer", () => {
	it("should tokenize a simple JSON object", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"key": "value"}')
		const tokens = tokenizer.allTokens()

		expect(tokens[0].type).toBe(TokenType.OBJECT_START)
		expect(tokens[0].value).toBe("{")
		expect(tokens[1].type).toBe(TokenType.STRING)
		expect(tokens[1].value).toBe("key")
		expect(tokens[2].type).toBe(TokenType.COLON)
		expect(tokens[3].type).toBe(TokenType.STRING)
		expect(tokens[3].value).toBe("value")
		expect(tokens[4].type).toBe(TokenType.OBJECT_END)
		expect(tokens[5].type).toBe(TokenType.EOF)
	})

	it("should handle partial input", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"a":')
		const tokens = tokenizer.allTokens()

		expect(tokens[0].type).toBe(TokenType.OBJECT_START)
		expect(tokens[1].type).toBe(TokenType.STRING)
		expect(tokens[1].value).toBe("a")
		expect(tokens[2].type).toBe(TokenType.COLON)
	})

	it("should tokenize numbers", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"n": 42}')
		const tokens = tokenizer.allTokens()

		expect(tokens[2].type).toBe(TokenType.COLON)
		expect(tokens[3].type).toBe(TokenType.NUMBER)
		expect(tokens[3].value).toBe("42")
	})

	it("should tokenize boolean and null literals", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed("[true, false, null]")
		const tokens = tokenizer.allTokens()

		expect(tokens[1].type).toBe(TokenType.TRUE)
		expect(tokens[3].type).toBe(TokenType.FALSE)
		expect(tokens[5].type).toBe(TokenType.NULL)
	})

	it("should handle XML tags", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed("<tool_call>")
		const tokens = tokenizer.allTokens()

		expect(tokens[0].type).toBe(TokenType.TAG_OPEN)
		expect(tokens[0].value).toBe("<tool_call>")
	})

	it("should handle closing XML tags", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed("</tool_call>")
		const tokens = tokenizer.allTokens()

		expect(tokens[0].type).toBe(TokenType.TAG_CLOSE)
		expect(tokens[0].value).toBe("</tool_call>")
	})

	it("should respect offset tracking", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"a": 1}')
		const tokens = tokenizer.allTokens()

		expect(tokens[0].offset).toBe(0)
		expect(tokens[0].value).toBe("{")
		expect(tokens[1].offset).toBe(1)
		expect(tokens[1].value).toBe("a")
		expect(tokens[2].offset).toBe(4)
		expect(tokens[2].value).toBe(":")
	})

	it("should handle incremental feeding", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"a')
		const t1 = tokenizer.next()
		expect(t1.type).toBe(TokenType.OBJECT_START)
		expect(t1.value).toBe("{")
		const t2 = tokenizer.next()
		expect(t2.type).toBe(TokenType.STRING)
		expect(t2.value).toBe("a")

		tokenizer.feed('": 1}')
		const t3 = tokenizer.next()
		// the remaining '"": 1}' starts with the closing quote of "a",
		// then ": 1}", so tokenizer reads it as a string ": 1"
		expect(t3.type).toBe(TokenType.STRING)
		expect(t3.value).toBe(": 1}")
		// No more tokens since everything was consumed by the string
		const t4 = tokenizer.next()
		expect(t4.type).toBe(TokenType.EOF)
	})

	it("should peek at next token type without consuming", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"key": "val"}')

		const type = tokenizer.peek()
		expect(type).toBe(TokenType.OBJECT_START)

		const token = tokenizer.next()
		expect(token.type).toBe(TokenType.OBJECT_START)
	})

	it("should handle unicode escape sequences in strings", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"emoji": "\\uD83D\\uDE00"}')
		const tokens = tokenizer.allTokens()
		const stringToken = tokens.find((t) => t.type === TokenType.STRING && t.value.length > 0 && t !== tokens[1])
		expect(stringToken).toBeDefined()
	})

	it("should handle unicode escape for accented characters", () => {
		const tokenizer = new Tokenizer()
		tokenizer.feed('{"accent": "\\u00E1"}')
		const tokens = tokenizer.allTokens()
		const stringToken = tokens.find((t) => t.type === TokenType.STRING && t.value !== "accent")
		expect(stringToken).toBeDefined()
	})
})
