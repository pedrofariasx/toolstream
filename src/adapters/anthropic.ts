import type { NormalizedDelta, ProviderName } from "../types.js"
import { BaseAdapter } from "./base.js"

interface ContentBlockState {
	index: number
	id: string | undefined
	name: string | undefined
	inputJson: string
	started: boolean
	stopped: boolean
}

export class AnthropicAdapter extends BaseAdapter {
	readonly name: ProviderName = "anthropic"
	private blocks: Map<number, ContentBlockState> = new Map()

	processChunk(chunk: string): Generator<NormalizedDelta> {
		return this.parseChunk(chunk)
	}

	detect(chunk: string): boolean {
		return chunk.includes("content_block") || chunk.includes("tool_use")
	}

	private *parseChunk(chunk: string): Generator<NormalizedDelta> {
		if (!chunk.trim()) return

		let parsed: any
		try {
			parsed = JSON.parse(chunk)
		} catch {
			return
		}

		const type = parsed?.type

		if (type === "content_block_start") {
			const block = parsed?.content_block
			if (block?.type === "tool_use") {
				const index = parsed.index ?? 0
				const state: ContentBlockState = {
					index,
					id: block.id,
					name: block.name,
					inputJson: "",
					started: true,
					stopped: false,
				}
				this.blocks.set(index, state)
				yield this.createToolDetected(index)
				if (block.id) yield this.createToolId(block.id, index)
				if (block.name) yield this.createToolName(block.name, index)
			}
		}

		if (type === "content_block_delta") {
			const delta = parsed?.delta
			if (delta?.type === "input_json_delta" && delta?.partial_json) {
				const index = parsed.index ?? 0
				let state = this.blocks.get(index)
				if (!state) {
					state = { index, id: undefined, name: undefined, inputJson: "", started: true, stopped: false }
					this.blocks.set(index, state)
				}
				state.inputJson += delta.partial_json
				yield this.createArgumentsDelta(delta.partial_json, index)
			}
		}
	}

	reset(): void {
		super.reset()
		this.blocks.clear()
	}
}
