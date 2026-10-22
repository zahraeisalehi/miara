# BoxAPI (LLM provider)

- Base URL `https://ai.boxapi.ir/ai/v1`, `Authorization: Bearer $BOXAPI_API_KEY`. OpenAI-compatible.
- Endpoints: `/chat/completions` (supports `stream: true`, SSE), `/responses`, `/embeddings`.
  Chat also accepts multipart with `file=@...`.
- 700+ models. Default `BOXAPI_MODEL` comes from env (the doc example uses `gpt-5.4-mini`).
- **No tool calling. Do not send `tools`.** The router, diagnoser, and narrator use JSON output + zod (see ARCHITECTURE).
- Fallback provider: Liara AI (OpenAI-compatible; supports tool calling, but we don't depend on it).

## Spike results (fill in during Phase 1)
- [ ] plain chat works
- [ ] streaming works through the AI SDK openai-compatible provider
- [ ] `response_format: json_object` supported?
- [ ] `response_format: json_schema` supported?
- [ ] Persian output quality is OK for the narrator
- [ ] latency p50 / p95
- [ ] chosen model(s) for router / diagnoser / narrator
