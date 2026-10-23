# BoxAPI (LLM provider)

- Base URL `https://ai.boxapi.ir/ai/v1`, `Authorization: Bearer $BOXAPI_API_KEY`. OpenAI-compatible.
- Endpoints: `/chat/completions` (supports `stream: true`, SSE), `/responses`, `/embeddings`.
  Chat also accepts multipart with `file=@...`.
- 700+ models. Default `BOXAPI_MODEL` comes from env (the doc example uses `gpt-5.4-mini`).
- **No tool calling. Do not send `tools`.** The router, diagnoser, and narrator use JSON output + zod (see ARCHITECTURE).
- Fallback provider: Liara AI (OpenAI-compatible; supports tool calling, but we don't depend on it).

## Spike results (Spike A, 2026-10-22, `pnpm spike:llm`, model `gpt-5.4-mini`, `reasoning_effort: "low"`)
- [x] **plain chat works**: 2,685 ms. The content was exactly `OK`, with 11 tokens in and 15 out.
- [x] **streaming works through the AI SDK openai-compatible provider**: `streamText` gave first token at 1,702 ms with 19 chunks.
  Raw SSE gave first token at 1,789 ms with 19 chunks, so the SDK adds no measurable overhead.
- [x] **`response_format: json_object` supported**: 2,358 ms. It passed zod: `{"intent":"restart","appName":"miara-demo"}`
  for the Persian prompt «اپ miara-demo رو ری‌استارت کن».
- [x] **`response_format: json_schema` (strict) supported**: 2,247 ms. It passed zod with the same output.
- [x] **Persian output quality is OK for the narrator**: 2,163 ms. The Persian is clear, correct and simple. It **uses markdown (bold)**.
- [x] **latency** over 5 sequential runs: min 1,625 · **p50 1,699** · **p95 2,086** · max 2,086 ms. With 5 runs, p95 is simply the max.
- [x] **`reasoning_effort: "low"` accepted**: 3,402 ms on the first (cold) call, with `reasoning_tokens` = 10.
- [x] **chosen model(s)**: **`gpt-5.4-mini` for all three roles** (router, diagnoser, narrator). Revisit only if diagnoser quality is weak on real evidence packs.

## Decisions from Spike A (the LLM layer must follow these)
- **One model, one config**: `BOXAPI_MODEL=gpt-5.4-mini`, and `reasoning_effort: "low"` on every call. The AI SDK sends it as
  `providerOptions: { boxapi: { reasoningEffort: 'low' } }` (the key is the `name` given to `createOpenAICompatible`, as in `spike-llm.ts`).
- **Router and diagnoser use strict `json_schema`**, generated from their zod schemas, and the output is still zod-parsed.
  Invalid output gets one repair retry. `json_object` and the prompt-plus-extract path stay as fallbacks for providers without
  `json_schema` (e.g. if Liara AI lacks it).
- **Log cost to the timeline**: BoxAPI returns `usage.cost` (USD; e.g. 0.0000612 for the probe call) and `usage.cost_details`
  alongside the token counts. Record `usage` (tokens, `reasoning_tokens`, cost) on the timeline event of **every** LLM call.
- **Narrator output is markdown**: the web UI renders it as markdown in RTL, sanitized and with no raw HTML. The MCP path
  passes it through as text.
- **Latency**: first token arrives in about 1.7 s, and a full JSON answer takes about 2.3 s. The UI shows a visible "thinking"
  state from send until the first token or the router result. Quick-action chips skip the router entirely.
