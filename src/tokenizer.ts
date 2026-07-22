import { type Token, TokenType } from "./types.js"

export class Tokenizer {
	private offset: number = 0
	private input: string = ""
	private position: number = 0

	reset(input?: string): void {
		this.offset = 0
		this.position = 0
		if (input !== undefined) this.input = input
	}

	feed(chunk: string): void {
		this.input += chunk
	}

	next(): Token {
		this.skipWhitespace()
		if (this.position >= this.input.length) {
			return this.makeToken(TokenType.EOF, "")
		}

		const char = this.input[this.position]

		switch (char) {
			case "{":
				this.position++
				return this.makeToken(TokenType.OBJECT_START, "{")
			case "}":
				this.position++
				return this.makeToken(TokenType.OBJECT_END, "}")
			case "[":
				this.position++
				return this.makeToken(TokenType.ARRAY_START, "[")
			case "]":
				this.position++
				return this.makeToken(TokenType.ARRAY_END, "]")
			case ":":
				this.position++
				return this.makeToken(TokenType.COLON, ":")
			case ",":
				this.position++
				return this.makeToken(TokenType.COMMA, ",")
			case '"':
				return this.readString()
			case "t":
				return this.readLiteral("true", TokenType.TRUE)
			case "f":
				return this.readLiteral("false", TokenType.FALSE)
			case "n":
				return this.readLiteral("null", TokenType.NULL)
			case "<":
				return this.readTag()
			default:
				if (char === "-" || (char >= "0" && char <= "9")) {
					return this.readNumber()
				}
				if (this.isIdentStart(char)) {
					return this.readIdentifier()
				}
				this.position++
				return this.makeToken(TokenType.INVALID, char)
		}
	}

	peek(): TokenType {
		const saved = this.position
		const token = this.next()
		this.position = saved
		return token.type
	}

	private readString(): Token {
		this.position++ // skip opening "
		let value = ""
		while (this.position < this.input.length) {
			const c = this.input[this.position]
			if (c === "\\") {
				this.position++
				if (this.position < this.input.length) {
					const next = this.input[this.position]
					if (next === "u") {
						value += this.readUnicodeEscape()
					} else {
						value += next
						this.position++
					}
				}
				continue
			}
			if (c === '"') {
				this.position++
				return this.makeToken(TokenType.STRING, value)
			}
			value += c
			this.position++
		}
		return this.makeToken(TokenType.STRING, value)
	}

	private readUnicodeEscape(): string {
		this.position++ // skip u
		if (this.position + 4 > this.input.length) {
			return "\\u"
		}
		const hex = this.input.slice(this.position, this.position + 4)
		this.position += 4
		if (/^[0-9a-fA-F]{4}$/.test(hex)) {
			return String.fromCharCode(parseInt(hex, 16))
		}
		return `\\u${hex}`
	}

	private readNumber(): Token {
		const start = this.position
		if (this.input[this.position] === "-") this.position++
		while (this.position < this.input.length && this.input[this.position] >= "0" && this.input[this.position] <= "9") {
			this.position++
		}
		if (this.position < this.input.length && this.input[this.position] === ".") {
			this.position++
			while (
				this.position < this.input.length &&
				this.input[this.position] >= "0" &&
				this.input[this.position] <= "9"
			) {
				this.position++
			}
		}
		if (this.position < this.input.length && (this.input[this.position] === "e" || this.input[this.position] === "E")) {
			this.position++
			if (
				this.position < this.input.length &&
				(this.input[this.position] === "+" || this.input[this.position] === "-")
			) {
				this.position++
			}
			while (
				this.position < this.input.length &&
				this.input[this.position] >= "0" &&
				this.input[this.position] <= "9"
			) {
				this.position++
			}
		}
		const value = this.input.slice(start, this.position)
		return this.makeToken(TokenType.NUMBER, value)
	}

	private readLiteral(expected: string, type: TokenType): Token {
		const start = this.position
		const slice = this.input.slice(this.position, this.position + expected.length)
		if (slice === expected) {
			this.position += expected.length
			return this.makeToken(type, slice)
		}
		this.position++
		return this.makeToken(TokenType.INVALID, this.input[start])
	}

	private readTag(): Token {
		this.position++ // skip <
		if (this.position < this.input.length && this.input[this.position] === "/") {
			this.position++ // skip /
			const name = this.readTagName()
			if (this.position < this.input.length && this.input[this.position] === ">") {
				this.position++
				return this.makeToken(TokenType.TAG_CLOSE, `</${name}>`)
			}
			return this.makeToken(TokenType.TAG_CLOSE, `</${name}`)
		}
		const name = this.readTagName()
		if (this.position < this.input.length && this.input[this.position] === "/") {
			this.position++
			if (this.position < this.input.length && this.input[this.position] === ">") {
				this.position++
				return this.makeToken(TokenType.TAG_SELF_CLOSE, `<${name}/>`)
			}
		}
		if (this.position < this.input.length && this.input[this.position] === ">") {
			this.position++
			return this.makeToken(TokenType.TAG_OPEN, `<${name}>`)
		}
		return this.makeToken(TokenType.TAG_OPEN, `<${name}`)
	}

	private readTagName(): string {
		let name = ""
		while (this.position < this.input.length) {
			const c = this.input[this.position]
			if (c === ">" || c === "/" || c === " " || c === "\n" || c === "\r" || c === "\t") break
			name += c
			this.position++
		}
		return name
	}

	private readIdentifier(): Token {
		const start = this.position
		while (this.position < this.input.length && this.isIdentPart(this.input[this.position])) {
			this.position++
		}
		const value = this.input.slice(start, this.position)
		return this.makeToken(TokenType.IDENTIFIER, value)
	}

	private skipWhitespace(): void {
		while (this.position < this.input.length) {
			const c = this.input[this.position]
			if (c === " " || c === "\n" || c === "\r" || c === "\t") {
				this.position++
			} else {
				break
			}
		}
	}

	private isIdentStart(c: string): boolean {
		return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$"
	}

	private isIdentPart(c: string): boolean {
		return this.isIdentStart(c) || (c >= "0" && c <= "9")
	}

	private makeToken(type: TokenType, value: string): Token {
		const startOffset = this.offset
		this.offset = this.position
		return { type, value, offset: startOffset, length: value.length }
	}

	allTokens(): Token[] {
		const tokens: Token[] = []
		let token = this.next()
		while (token.type !== TokenType.EOF) {
			tokens.push(token)
			token = this.next()
		}
		tokens.push(token)
		return tokens
	}
}
