import type { ProviderName, ToolStreamEventMap } from "./types.js"

export interface AIManifestEntry {
	name: string
	type: string
	description: string
	importPath: string
	signature: string
}

export interface AIProviderInfo {
	name: ProviderName
	description: string
	streaming: boolean
}

export interface AIEventInfo {
	name: keyof ToolStreamEventMap
	signature: string
	description: string
}

export function getAIManifest() {
	return {
		name: "@pedrofariasx/toolstream",
		version: "0.2.0",
		description: "Incremental streaming parser for LLM tool calls",
		mainClass: {
			name: "ToolStream",
			importPath: "@pedrofariasx/toolstream",
			description: "Main streaming parser class. Extends ToolStreamEmitter for event-driven parsing.",
			constructor: {
				params: [{ name: "options", type: "ToolStreamOptions", optional: true }],
			},
			methods: [
				"push(chunk: string): this",
				"finalize(): CompletedToolCall[]",
				"getPendingCalls(): PendingToolCall[]",
				"getCompletedCalls(): CompletedToolCall[]",
				"getNormalizedCalls(): NormalizedToolCall[]",
				"snapshot(): ToolStreamSnapshot",
				"reset(): void",
				"setProvider(provider: ProviderName): void",
				"getProvider(): ProviderName | null",
			],
		},
		imports: [
			{
				path: "@pedrofariasx/toolstream",
				exports: [
					"ToolStream",
					"adapterRegistry",
					"ConfidenceScorer",
					"Normalizer",
					"RecoveryEngine",
					"Tokenizer",
					"ToolCallStateMachine",
					"JsonStreamParser",
					"JsonRepairer",
					"ToolStreamEmitter",
				],
			},
			{
				path: "@pedrofariasx/toolstream/adapters",
				exports: [
					"OpenAIAdapter",
					"AnthropicAdapter",
					"GeminiAdapter",
					"DeepSeekAdapter",
					"QwenAdapter",
					"XmlAdapter",
					"MarkdownAdapter",
					"BaseAdapter",
					"adapterRegistry",
				],
			},
			{ path: "@pedrofariasx/toolstream/ai", exports: ["getAIManifest", "getIntegrationGuide", "ai"] },
		],
		providers: getProviders(),
		events: getEvents(),
		options: getOptions(),
	} as const
}

export function getProviders(): AIProviderInfo[] {
	return [
		{ name: "openai", description: "OpenAI streaming tool calls (SSE delta format)", streaming: true },
		{ name: "anthropic", description: "Anthropic Claude streaming (content_block_start/delta/stop)", streaming: true },
		{ name: "gemini", description: "Google Gemini functionCall parts", streaming: false },
		{ name: "deepseek", description: "DeepSeek OpenAI-compatible streaming", streaming: true },
		{ name: "qwen", description: "Qwen OpenAI-compatible streaming", streaming: true },
		{ name: "xml", description: "XML tool_call blocks", streaming: true },
		{ name: "markdown", description: "Markdown fenced code blocks", streaming: true },
	]
}

export function getEvents(): AIEventInfo[] {
	return [
		{ name: "text", signature: "(text: string) => void", description: "Plain text content" },
		{ name: "token", signature: "(type: string, value: string) => void", description: "Token from tokenizer" },
		{ name: "toolDetected", signature: "(call: PendingToolCall) => void", description: "New tool call detected" },
		{
			name: "toolStarted",
			signature: "(id: string, name: string, index: number) => void",
			description: "Tool call name identified",
		},
		{ name: "toolUpdated", signature: "(call: PendingToolCall) => void", description: "Pending call updated" },
		{
			name: "argumentsUpdated",
			signature: "(delta: string, partial: Record<string, unknown>, index: number) => void",
			description: "Arguments delta received",
		},
		{
			name: "jsonUpdated",
			signature: "(parsed: Record<string, unknown>, index: number) => void",
			description: "JSON partially parsed",
		},
		{
			name: "repair",
			signature: "(original: string, repaired: string, index?: number) => void",
			description: "JSON repaired",
		},
		{ name: "normalized", signature: "(call: NormalizedToolCall) => void", description: "Tool call normalized" },
		{ name: "toolCompleted", signature: "(call: CompletedToolCall) => void", description: "Tool call completed" },
		{ name: "error", signature: "(error: ToolStreamError) => void", description: "Parse error" },
		{ name: "stateChanged", signature: "(state: string) => void", description: "Parser state changed" },
	]
}

export function getOptions(): Record<string, string> {
	return {
		autoDetectProvider: "boolean (default: true) — automatically detect provider format",
		provider: "ProviderName (default: 'openai') — explicit provider name",
		customAdapter: "ProviderAdapter — custom adapter for non-standard formats",
		earlyExecutionThreshold: "number (default: 0.85) — confidence threshold for early execution",
		maxBufferSize: "number (default: 1048576) — internal buffer size in bytes",
		environment: "'node' | 'bun' | 'deno' | 'browser' | 'cloudflare-workers' (default: 'node')",
	}
}

export function getQuickStart(): string {
	return [
		"// 1. Install:",
		"// npm install @pedrofariasx/toolstream",
		"",
		"// 2. Import:",
		`import { ToolStream } from "@pedrofariasx/toolstream"`,
		"",
		"// 3. Create parser:",
		`const parser = new ToolStream({ provider: "openai" })`,
		"",
		"// 4. Listen for events:",
		`parser.on("tool-call:complete", (call) => {`,
		"  console.log(call.name, call.arguments)",
		"})",
		"",
		"// 5. Feed chunks (streaming):",
		"for await (const chunk of stream) {",
		"  parser.push(chunk)",
		"}",
		"",
		"// 6. Finalize:",
		"const results = parser.finalize()",
	].join("\n")
}

export function getIntegrationGuide(): string {
	return [
		"# ToolStream — AI Integration Guide",
		"",
		"## Import",
		`import { ToolStream } from "@pedrofariasx/toolstream"`,
		"",
		"## Create Parser",
		'const parser = new ToolStream({ provider: "openai" })',
		"// or: new ToolStream({ autoDetectProvider: true })",
		"",
		"## Events",
		`parser.on("tool-call:start", (call) => { ... })`,
		`parser.on("tool-call:arguments:delta", (delta, partial) => { ... })`,
		`parser.on("tool-call:complete", (call) => { ... })`,
		`parser.on("tool-call:error", (err) => { ... })`,
		"",
		"## Streaming",
		"for await (const chunk of stream) parser.push(chunk)",
		"const completed = parser.finalize()",
		"",
		"## Providers",
		"Supported: openai, anthropic, gemini, deepseek, qwen, xml, markdown",
		"",
		"## Docs",
		"AI manifest: node_modules/@pedrofariasx/toolstream/ai/manifest.json",
	].join("\n")
}

export const ai = {
	manifest: getAIManifest,
	guide: getIntegrationGuide,
	quickStart: getQuickStart,
	providers: getProviders,
	events: getEvents,
	options: getOptions,
} as const
