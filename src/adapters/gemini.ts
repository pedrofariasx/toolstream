import type { NormalizedDelta, ProviderName } from "../types.js"
import { BaseAdapter } from "./base.js"

export class GeminiAdapter extends BaseAdapter {
	readonly name: ProviderName = "gemini"

	processChunk(chunk: string): Generator<NormalizedDelta> {
		return this.parseChunk(chunk)
	}

	detect(chunk: string): boolean {
		return chunk.includes("functionCall") || (chunk.includes("candidates") && chunk.includes("functionCall"))
	}

	private *parseChunk(chunk: string): Generator<NormalizedDelta> {
		if (!chunk.trim()) return

		let parsed: any
		try {
			parsed = JSON.parse(chunk)
		} catch {
			return
		}

		const items = Array.isArray(parsed) ? parsed : [parsed]

		for (const item of items) {
			const candidates = item?.candidates
			if (!candidates?.length) continue

			for (const candidate of candidates) {
				const parts = candidate?.content?.parts
				if (!parts?.length) continue

				for (const part of parts) {
					const fc = part?.functionCall
					if (!fc) continue

					const index = 0
					yield this.createToolDetected(index)
					if (fc.name) yield this.createToolName(fc.name, index)
					if (fc.args) {
						const argsStr = JSON.stringify(fc.args)
						yield this.createArgumentsDelta(argsStr, index)
					}
					yield this.createToolStop(index)
				}
			}
		}
	}

	reset(): void {
		super.reset()
	}
}
