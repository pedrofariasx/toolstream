import type { NormalizedDelta, ProviderName } from "../types.js"
import { BaseAdapter } from "./base.js"

interface PendingCall {
	index: number
	name: string
	argsBuffer: string
	currentParamKey: string | undefined
	currentParamValue: string
	nameComplete: boolean
}

const MAX_ADAPTER_BUFFER = 512 * 1024

function escapeJson(s: string): string {
	let r = ""
	for (let i = 0; i < s.length; i++) {
		const c = s[i]
		switch (c) {
			case '"':
				r += '\\"'
				break
			case "\\":
				r += "\\\\"
				break
			case "\n":
				r += "\\n"
				break
			case "\r":
				r += "\\r"
				break
			case "\t":
				r += "\\t"
				break
			case "\b":
				r += "\\b"
				break
			case "\f":
				r += "\\f"
				break
			default:
				r += c < " " ? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}` : c
		}
	}
	return r
}

export class FunctionTagAdapter extends BaseAdapter {
	readonly name: ProviderName = "custom"
	private pending: PendingCall[] = []
	private nextIndex: number = 0
	private inToolCall: boolean = false
	private inParameter: boolean = false
	private tagName: string = ""
	private inTag: boolean = false
	private current: PendingCall | null = null
	private buffer: string = ""
	private calledProcessedUpTo: number = 0

	processChunk(chunk: string): Generator<NormalizedDelta> {
		return this.parseChunk(chunk)
	}

	detect(chunk: string): boolean {
		return (
			chunk.includes("<tool_call>") ||
			chunk.includes("<function=") ||
			chunk.includes("<parameter=") ||
			chunk.includes("[Called ")
		)
	}

	private *parseChunk(chunk: string): Generator<NormalizedDelta> {
		this.buffer += chunk
		if (this.buffer.length > MAX_ADAPTER_BUFFER) {
			this.buffer = this.buffer.slice(-Math.floor(MAX_ADAPTER_BUFFER / 2))
		}

		for (let i = 0; i < chunk.length; i++) {
			const char = chunk[i]

			if (char === "<" && !this.inTag) {
				this.inTag = true
				this.tagName = ""
				continue
			}

			if (this.inTag) {
				if (char === ">") {
					this.inTag = false
					const results = this.handleTag(this.tagName)
					if (results) yield* results
					continue
				}
				this.tagName += char
				continue
			}

			if (this.inToolCall && this.current) {
				if (this.inParameter && this.current.currentParamKey) {
					this.current.currentParamValue += char
				}
			}
		}

		yield* this.tryParseCalledInBuffer()
	}

	private *tryParseCalledInBuffer(): Generator<NormalizedDelta> {
		const searchFrom = Math.max(0, this.calledProcessedUpTo)
		let idx = this.buffer.indexOf("[Called ", searchFrom)

		while (idx !== -1) {
			const endBracket = this.buffer.indexOf("]", idx)
			if (endBracket === -1) break

			const inner = this.buffer.slice(idx + 8, endBracket)
			const withIdx = inner.indexOf(" with ")
			if (withIdx === -1) {
				this.calledProcessedUpTo = endBracket + 1
				idx = this.buffer.indexOf("[Called ", this.calledProcessedUpTo)
				continue
			}

			const name = inner.slice(0, withIdx).trim()
			const jsonStr = inner.slice(withIdx + 6)

			let parsed: Record<string, unknown>
			try {
				parsed = JSON.parse(jsonStr)
			} catch {
				this.calledProcessedUpTo = endBracket + 1
				idx = this.buffer.indexOf("[Called ", this.calledProcessedUpTo)
				continue
			}

			const args = JSON.stringify(parsed)
			const index = this.nextIndex++
			yield this.createToolDetected(index)
			yield this.createToolName(name, index)
			yield this.createArgumentsDelta(args, index)
			yield this.createToolStop(index)

			this.calledProcessedUpTo = endBracket + 1
			idx = this.buffer.indexOf("[Called ", this.calledProcessedUpTo)
		}
	}

	private handleTag(tag: string): NormalizedDelta[] | null {
		const isClosing = tag.startsWith("/")
		const content = isClosing ? tag.slice(1) : tag

		if (content === "tool_call") {
			if (isClosing) {
				return this.finishToolCall()
			}
			this.startToolCall()
			return null
		}

		if (!this.current) return null

		if (content.startsWith("function=")) {
			if (!isClosing) {
				const name = content.slice(9)
				this.current.name = name
				this.current.nameComplete = true
				return [this.createToolDetected(this.current.index), this.createToolName(name, this.current.index)]
			}
			return null
		}

		if (content.startsWith("parameter=")) {
			if (!isClosing) {
				const key = content.slice(10)
				this.current.currentParamKey = key
				this.current.currentParamValue = ""
				this.inParameter = true
				return null
			}
			this.flushParameter()
			return null
		}

		if (content === "parameter") {
			this.flushParameter()
			return null
		}

		return null
	}

	private flushParameter(): void {
		if (this.current?.currentParamKey) {
			this.current.argsBuffer += `"${this.current.currentParamKey}":"${escapeJson(this.current.currentParamValue)}",`
			this.current.currentParamKey = undefined
			this.current.currentParamValue = ""
		}
		this.inParameter = false
	}

	private startToolCall(): void {
		const call: PendingCall = {
			index: this.nextIndex++,
			name: "",
			argsBuffer: "",
			currentParamKey: undefined,
			currentParamValue: "",
			nameComplete: false,
		}
		this.current = call
		this.pending.push(call)
		this.inToolCall = true
	}

	private finishToolCall(): NormalizedDelta[] | null {
		if (!this.current?.name) return null

		this.flushParameter()

		const args = `{${this.current.argsBuffer.replace(/,$/, "")}}`
		const deltas: NormalizedDelta[] = []
		if (args !== "{}") {
			deltas.push(this.createArgumentsDelta(args, this.current.index))
		}
		deltas.push(this.createToolStop(this.current.index))

		this.inToolCall = false
		this.inParameter = false
		this.current = null

		return deltas
	}

	reset(): void {
		super.reset()
		this.buffer = ""
		this.pending = []
		this.nextIndex = 0
		this.inToolCall = false
		this.inParameter = false
		this.tagName = ""
		this.inTag = false
		this.current = null
		this.calledProcessedUpTo = 0
	}
}
