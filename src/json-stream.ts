import type { PartialJsonResult, RepairChange, RepairSuggestion } from "./types.js"

enum JsonStreamState {
	VALUE,
	STRING,
	STRING_ESCAPE,
	NUMBER,
	NUMBER_FRACTION,
	NUMBER_EXP,
	NUMBER_EXP_VALUE,
	TRUE_1,
	TRUE_2,
	TRUE_3,
	FALSE_1,
	FALSE_2,
	FALSE_3,
	FALSE_4,
	NULL_1,
	NULL_2,
	NULL_3,
	OBJECT_KEY,
	OBJECT_COLON,
	OBJECT_VALUE,
	OBJECT_COMMA,
	ARRAY_VALUE,
	ARRAY_COMMA,
	COMPLETE,
	ERROR,
}

interface JsonContext {
	type: "object" | "array"
	key?: string
	count: number
}

export class JsonStreamParser {
	private state: JsonStreamState = JsonStreamState.VALUE
	private stack: JsonContext[] = []
	private currentString: string = ""
	private currentNumber: string = ""
	private depth: number = 0
	private buffer: string = ""

	feed(chunk: string): void {
		this.buffer += chunk
		for (let i = 0; i < chunk.length; i++) {
			this.processChar(chunk[i])
			if (this.state === JsonStreamState.COMPLETE) break
		}
	}

	private processChar(char: string): void {
		switch (this.state) {
			case JsonStreamState.VALUE:
				this.handleValue(char)
				break
			case JsonStreamState.STRING:
				this.handleString(char)
				break
			case JsonStreamState.STRING_ESCAPE:
				this.handleStringEscape(char)
				break
			case JsonStreamState.NUMBER:
				this.handleNumber(char)
				break
			case JsonStreamState.NUMBER_FRACTION:
				this.handleNumberFraction(char)
				break
			case JsonStreamState.NUMBER_EXP:
				this.handleNumberExp(char)
				break
			case JsonStreamState.NUMBER_EXP_VALUE:
				this.handleNumberExpValue(char)
				break
			case JsonStreamState.TRUE_1:
				this.state = char === "r" ? JsonStreamState.TRUE_2 : JsonStreamState.ERROR
				break
			case JsonStreamState.TRUE_2:
				this.state = char === "u" ? JsonStreamState.TRUE_3 : JsonStreamState.ERROR
				break
			case JsonStreamState.TRUE_3:
				this.state = char === "e" ? this.afterScalar() : JsonStreamState.ERROR
				break
			case JsonStreamState.FALSE_1:
				this.state = char === "a" ? JsonStreamState.FALSE_2 : JsonStreamState.ERROR
				break
			case JsonStreamState.FALSE_2:
				this.state = char === "l" ? JsonStreamState.FALSE_3 : JsonStreamState.ERROR
				break
			case JsonStreamState.FALSE_3:
				this.state = char === "s" ? JsonStreamState.FALSE_4 : JsonStreamState.ERROR
				break
			case JsonStreamState.FALSE_4:
				this.state = char === "e" ? this.afterScalar() : JsonStreamState.ERROR
				break
			case JsonStreamState.NULL_1:
				this.state = char === "u" ? JsonStreamState.NULL_2 : JsonStreamState.ERROR
				break
			case JsonStreamState.NULL_2:
				this.state = char === "l" ? JsonStreamState.NULL_3 : JsonStreamState.ERROR
				break
			case JsonStreamState.NULL_3:
				this.state = char === "l" ? this.afterScalar() : JsonStreamState.ERROR
				break
			case JsonStreamState.OBJECT_KEY:
				this.handleObjectKey(char)
				break
			case JsonStreamState.OBJECT_COLON:
				this.handleObjectColon(char)
				break
			case JsonStreamState.OBJECT_VALUE:
				this.handleObjectValueAfter(char)
				break
			case JsonStreamState.OBJECT_COMMA:
				this.handleObjectComma(char)
				break
			case JsonStreamState.ARRAY_VALUE:
				this.handleArrayValueStart(char)
				break
			case JsonStreamState.ARRAY_COMMA:
				this.handleArrayComma(char)
				break
		}
	}

	private handleValue(char: string): void {
		if (isWhitespace(char)) return
		switch (char) {
			case "{":
				this.stack.push({ type: "object", count: 0 })
				this.depth++
				this.state = JsonStreamState.OBJECT_KEY
				break
			case "[":
				this.stack.push({ type: "array", count: 0 })
				this.depth++
				this.state = JsonStreamState.ARRAY_VALUE
				break
			case '"':
				this.currentString = ""
				this.state = JsonStreamState.STRING
				break
			case "t":
				this.state = JsonStreamState.TRUE_1
				break
			case "f":
				this.state = JsonStreamState.FALSE_1
				break
			case "n":
				this.state = JsonStreamState.NULL_1
				break
			case "-":
				this.currentNumber = "-"
				this.state = JsonStreamState.NUMBER
				break
			default:
				if (char >= "0" && char <= "9") {
					this.currentNumber = char
					this.state = JsonStreamState.NUMBER
				} else {
					this.state = JsonStreamState.ERROR
				}
		}
	}

	private handleString(char: string): void {
		if (char === "\\") {
			this.state = JsonStreamState.STRING_ESCAPE
		} else if (char === '"') {
			const val = this.currentString
			this.currentString = ""
			if (this.stack.length > 0) {
				const ctx = this.stack[this.stack.length - 1]
				if (ctx.type === "object" && ctx.key === undefined) {
					ctx.key = val
					this.state = JsonStreamState.OBJECT_COLON
					return
				}
			}
			this.state = this.afterScalar()
		} else {
			this.currentString += char
		}
	}

	private handleStringEscape(char: string): void {
		switch (char) {
			case '"':
				this.currentString += '"'
				break
			case "\\":
				this.currentString += "\\"
				break
			case "/":
				this.currentString += "/"
				break
			case "b":
				this.currentString += "\b"
				break
			case "f":
				this.currentString += "\f"
				break
			case "n":
				this.currentString += "\n"
				break
			case "r":
				this.currentString += "\r"
				break
			case "t":
				this.currentString += "\t"
				break
			case "u":
				this.currentString += "\\u"
				break
			default:
				this.currentString += char
		}
		this.state = JsonStreamState.STRING
	}

	private handleNumber(char: string): void {
		if (char >= "0" && char <= "9") {
			this.currentNumber += char
		} else if (char === ".") {
			this.currentNumber += "."
			this.state = JsonStreamState.NUMBER_FRACTION
		} else if (char === "e" || char === "E") {
			this.currentNumber += char
			this.state = JsonStreamState.NUMBER_EXP
		} else {
			this.currentNumber = ""
			this.state = this.afterScalar()
			this.processChar(char)
		}
	}

	private handleNumberFraction(char: string): void {
		if (char >= "0" && char <= "9") {
			this.currentNumber += char
		} else if (char === "e" || char === "E") {
			this.currentNumber += char
			this.state = JsonStreamState.NUMBER_EXP
		} else {
			this.currentNumber = ""
			this.state = this.afterScalar()
			this.processChar(char)
		}
	}

	private handleNumberExp(char: string): void {
		if (char === "+" || char === "-") {
			this.currentNumber += char
			this.state = JsonStreamState.NUMBER_EXP_VALUE
		} else if (char >= "0" && char <= "9") {
			this.currentNumber += char
			this.state = JsonStreamState.NUMBER_EXP_VALUE
		} else {
			this.currentNumber = ""
			this.state = this.afterScalar()
			this.processChar(char)
		}
	}

	private handleNumberExpValue(char: string): void {
		if (char >= "0" && char <= "9") {
			this.currentNumber += char
		} else {
			this.currentNumber = ""
			this.state = this.afterScalar()
			this.processChar(char)
		}
	}

	private handleObjectKey(char: string): void {
		if (isWhitespace(char)) return
		if (char === '"') {
			this.currentString = ""
			this.state = JsonStreamState.STRING
		} else if (char === "}") {
			this.popContext()
		} else {
			this.state = JsonStreamState.ERROR
		}
	}

	private handleObjectColon(char: string): void {
		if (isWhitespace(char)) return
		if (char === ":") {
			this.state = JsonStreamState.OBJECT_VALUE
		} else {
			this.state = JsonStreamState.ERROR
		}
	}

	private handleObjectValueAfter(char: string): void {
		if (isWhitespace(char)) return
		this.state = JsonStreamState.VALUE
		this.processChar(char)
	}

	private handleObjectComma(char: string): void {
		if (isWhitespace(char)) return
		if (char === ",") {
			const ctx = this.stack[this.stack.length - 1]
			if (ctx) ctx.key = undefined
			this.state = JsonStreamState.OBJECT_KEY
		} else if (char === "}") {
			this.popContext()
		} else {
			this.state = JsonStreamState.ERROR
		}
	}

	private handleArrayValueStart(char: string): void {
		if (isWhitespace(char)) return
		this.state = JsonStreamState.VALUE
		this.processChar(char)
	}

	private handleArrayComma(char: string): void {
		if (isWhitespace(char)) return
		if (char === ",") {
			this.state = JsonStreamState.ARRAY_VALUE
		} else if (char === "]") {
			this.popContext()
		} else {
			this.state = JsonStreamState.ERROR
		}
	}

	private afterScalar(): JsonStreamState {
		if (this.depth === 0) return JsonStreamState.COMPLETE
		const ctx = this.stack[this.stack.length - 1]
		if (ctx) ctx.count++
		return ctx?.type === "object" ? JsonStreamState.OBJECT_COMMA : JsonStreamState.ARRAY_COMMA
	}

	private popContext(): void {
		this.stack.pop()
		this.depth--
		if (this.depth === 0) {
			this.state = JsonStreamState.COMPLETE
		} else {
			const parent = this.stack[this.stack.length - 1]
			if (parent) {
				parent.count++
				this.state = parent.type === "object" ? JsonStreamState.OBJECT_COMMA : JsonStreamState.ARRAY_COMMA
			}
		}
	}

	fixPartial(): string {
		let result = this.buffer

		const openBraces = countChar(result, "{")
		const closeBraces = countChar(result, "}")
		const openBrackets = countChar(result, "[")
		const closeBrackets = countChar(result, "]")

		if (this.state === JsonStreamState.STRING || this.state === JsonStreamState.STRING_ESCAPE) {
			result += '"'
		}

		if (
			this.state === JsonStreamState.NUMBER ||
			this.state === JsonStreamState.NUMBER_FRACTION ||
			this.state === JsonStreamState.NUMBER_EXP ||
			this.state === JsonStreamState.NUMBER_EXP_VALUE
		) {
			if (
				this.currentNumber.endsWith(".") ||
				this.currentNumber.endsWith("e") ||
				this.currentNumber.endsWith("E") ||
				this.currentNumber.endsWith("+") ||
				this.currentNumber.endsWith("-")
			) {
				result += "0"
			}
		}

		if (this.state === JsonStreamState.OBJECT_COLON || this.state === JsonStreamState.OBJECT_VALUE) {
			result += "null"
		}

		if (this.state === JsonStreamState.OBJECT_COMMA || this.state === JsonStreamState.ARRAY_COMMA) {
			result = result.replace(/,\s*$/, "")
		}

		if (openBraces > closeBraces) result += "}".repeat(openBraces - closeBraces)
		if (openBrackets > closeBrackets) result += "]".repeat(openBrackets - closeBrackets)

		return result
	}

	getBestEffort(): string {
		if (this.state === JsonStreamState.COMPLETE) return this.buffer
		return this.fixPartial()
	}

	getBestEffortValue(): PartialJsonResult {
		if (this.state === JsonStreamState.COMPLETE) {
			try {
				return { value: JSON.parse(this.buffer), partial: false, depth: 0 }
			} catch {}
		}
		const repaired = this.fixPartial()
		try {
			const value = JSON.parse(repaired)
			return { value, partial: true, depth: this.depth }
		} catch {
			try {
				const furtherRepaired = JsonRepairer.repair(repaired)
				if (furtherRepaired) {
					return { value: JSON.parse(furtherRepaired.repaired), partial: true, depth: this.depth }
				}
			} catch {}
			return { value: {}, partial: true, depth: this.depth }
		}
	}

	getState(): { depth: number; partial: boolean; state: string } {
		return {
			depth: this.depth,
			partial: this.state !== JsonStreamState.COMPLETE,
			state: JsonStreamState[this.state],
		}
	}

	reset(): void {
		this.state = JsonStreamState.VALUE
		this.stack = []
		this.currentString = ""
		this.currentNumber = ""
		this.depth = 0
		this.buffer = ""
	}
}

export class JsonRepairer {
	static repair(input: string): RepairSuggestion | null {
		const changes: RepairChange[] = []
		let repaired = input

		const needsQuote = JsonRepairer.needsClosingQuote(repaired)
		if (needsQuote) {
			repaired += '"'
			changes.push({ type: "insert", offset: repaired.length - 1, original: "", replacement: '"' })
		}

		const closings = JsonRepairer.computeMissingClosings(repaired)
		if (closings.length > 0) {
			changes.push({ type: "insert", offset: repaired.length, original: "", replacement: closings })
			repaired += closings
		}

		repaired = JsonRepairer.fixTrailingCommas(repaired)
		repaired = JsonRepairer.fixTrailingColon(repaired)
		repaired = JsonRepairer.fixUnquotedKeys(repaired)
		repaired = JsonRepairer.fixSingleQuotes(repaired)
		repaired = JsonRepairer.fixTrailingDecimal(repaired)
		repaired = JsonRepairer.fixIncompleteBeforeBrace(repaired)

		if (changes.length === 0 && repaired === input) return null
		return {
			original: input,
			repaired,
			changes,
			confidence: JsonRepairer.calculateConfidence(changes.length),
		}
	}

	private static needsClosingQuote(s: string): boolean {
		const inString = JsonRepairer.isInsideUnclosedString(s)
		return inString
	}

	private static isInsideUnclosedString(s: string): boolean {
		let inStr = false
		let escaped = false
		for (let i = 0; i < s.length; i++) {
			const c = s[i]
			if (escaped) {
				escaped = false
				continue
			}
			if (c === "\\") {
				escaped = true
				continue
			}
			if (c === '"') inStr = !inStr
		}
		return inStr
	}

	private static fixTrailingCommas(s: string): string {
		return s.replace(/,(\s*[}\]])/g, "$1")
	}

	private static fixTrailingColon(s: string): string {
		return s.replace(/:\s*$/g, ": null")
	}

	private static fixUnquotedKeys(s: string): string {
		return s.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
	}

	private static fixSingleQuotes(s: string): string {
		return s.replace(/'([^']*)'/g, '"$1"')
	}

	private static fixTrailingDecimal(s: string): string {
		return s.replace(/(\d+)\.(\s*[,}\]])/g, "$1.0$2").replace(/(\d+)\.$/g, "$1.0")
	}

	private static fixIncompleteBeforeBrace(s: string): string {
		return s.replace(/,\s*([}\]])/g, "$1")
	}

	private static computeMissingClosings(s: string): string {
		const stack: string[] = []
		let inStr = false
		let escaped = false
		for (let i = 0; i < s.length; i++) {
			const c = s[i]
			if (escaped) {
				escaped = false
				continue
			}
			if (c === "\\") {
				escaped = true
				continue
			}
			if (c === '"') {
				inStr = !inStr
				continue
			}
			if (inStr) continue
			if (c === "{") stack.push("}")
			if (c === "[") stack.push("]")
			if (c === "}" || c === "]") {
				if (stack.length > 0 && stack[stack.length - 1] === c) {
					stack.pop()
				}
			}
		}
		return stack.reverse().join("")
	}

	private static calculateConfidence(changeCount: number): number {
		return Math.max(0, 1 - changeCount * 0.15)
	}
}

function countChar(s: string, char: string): number {
	let count = 0
	for (let i = 0; i < s.length; i++) if (s[i] === char) count++
	return count
}

function isWhitespace(char: string): boolean {
	return char === " " || char === "\n" || char === "\r" || char === "\t"
}
