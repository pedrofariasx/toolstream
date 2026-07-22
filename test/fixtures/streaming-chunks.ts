export const openaiChunks = {
	parallelToolCalls: [
		`data: {"choices":[{"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"loc"}}]}}]}\n\n`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ation\\": \\"San"}}]}}]}\n\n`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Francisco\\"}"}}]}}]}\n\n`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","type":"function","function":{"name":"get_time","arguments":""}}]}}]}\n\n`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"timezone\\": \\"America/Los_Angeles\\"}"}}]}}]}\n\n`,
		`data: [DONE]\n\n`,
	],

	singleStreaming: [
		`{"choices":[{"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"search_docs","arguments":""}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"query\\": \\"t"}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ool calling\\""}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":", \\"limit\\": 5}"}}]}}]}`,
	],

	noToolCalls: [
		`{"choices":[{"delta":{"role":"assistant","content":"Hello! How can I help you today?"}}]}`,
		`{"choices":[{"delta":{"content":" I can answer questions about"}}]}`,
		`{"choices":[{"delta":{"content":" various topics."}}]}`,
		`{"choices":[{"delta":{}}]}`,
	],
}

export const anthropicChunks = {
	streaming: [
		`{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_abc","name":"get_weather"}}`,
		`{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"loc"}}`,
		`{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"ation\\": \\"San"}}`,
		`{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":" Francisco\\"}"}}`,
		`{"type":"content_block_stop","index":0}`,
	],
}

export const geminiChunks = {
	streaming: [
		`[{"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_weather","args":{"location":"San Francisco","unit":"celsius"}}}]}}]}]`,
	],
}

export const deepseekChunks = {
	streaming: [
		`{"choices":[{"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_ds_1","type":"function","function":{"name":"analyze_data","arguments":""}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"dataset\\": \\"sales"}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"_2024\\", \\"aggregation\\": \\"monthly\\"}"}}]}}]}`,
	],
}

export const qwenChunks = {
	streaming: [
		`{"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_qw_1","type":"function","function":{"name":"translate","arguments":""}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"text\\": \\"Hello"}}]}}]}`,
		`{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" world\\", \\"target\\": \\"es\\"}"}}]}}]}`,
	],
}

export const xmlChunks = {
	streaming: [
		`<tool_call>`,
		`  <tool_name>get_weather</tool_name>`,
		`  <parameters>`,
		`    <location>San Francisco</location>`,
		`    <unit>celsius</unit>`,
		`  </parameters>`,
		`</tool_call>`,
	],
}

export const partialJsonExamples = {
	incompleteObject: `{"key": "value"`,
	incompleteString: `{"name": "John`,
	incompleteArray: `{"items": [1, 2, 3`,
	nestedIncomplete: `{"outer": {"inner": "value"`,
	trailingComma: `{"a": 1, "b": 2,}`,
	unquotedKey: `{key: "value"}`,
	singleQuotes: `{'key': 'value'}`,
	trailingDecimal: `{"pi": 3.}`,
	emptyObject: `{}`,
	complexPartial: `{"users": [{"name": "Alice", "age": 30}`,
	deeplyNested: `{"level1": {"level2": {"level3": {"level4": "deep"`,
}
