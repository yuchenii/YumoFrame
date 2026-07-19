# DashScope Qwen TTS API Design

## Goal

Add Alibaba Cloud Model Studio's native non-realtime Qwen TTS HTTP API to the existing Node `api` runner. Preserve the existing OpenAI-compatible and custom provider paths unchanged.

## Decision

Use Node's existing `fetch` path, not the DashScope Python SDK. The CLI already owns API authentication, output files, segmented requests, merging, and alignment in TypeScript. A Python SDK would add a uv environment and another process without removing any Node responsibilities.

`provider: "dashscope"` is the only documented DashScope provider name (no legacy aliases).

## Configuration

```json
{
  "runner": "api",
  "provider": "dashscope",
  "model": "qwen3-tts-instruct-flash",
  "voice": "Cherry",
  "apiKeyEnv": "DASHSCOPE_API_KEY",
  "options": {
    "languageType": "Chinese"
  }
}
```

The default Beijing API root is `https://dashscope.aliyuncs.com/api/v1`. `baseUrl` may replace that root for another Alibaba Cloud region. The request appends `/services/aigc/multimodal-generation/generation`.

## Request and Response

For DashScope providers, build the documented native request:

```json
{
  "model": "qwen3-tts-instruct-flash",
  "input": {
    "text": "...",
    "voice": "Cherry",
    "language_type": "Chinese",
    "instructions": "...",
    "optimize_instructions": true
  }
}
```

The configured model, voice, and current segment text remain authoritative and cannot be overridden by arbitrary options. Whole-text synthesis uses configured options. Segmented synthesis supplies only profile-approved delivery fields.

On success, prefer `output.audio.url` and download it immediately because the URL expires. If `output.audio.data` is non-empty, accept its Base64 audio bytes as a fallback. Reject missing audio, malformed JSON, non-2xx synthesis responses, and failed audio downloads without replacing the target file.

## Capability Profiles

- `qwen3-tts-instruct-flash`: sequential segmented API profile using `dashscope-instruct` with non-empty `instructions`. `optimizeInstructions` stays a global project option so the Agent cannot vary it accidentally between segments.
- `qwen3-tts-flash`: whole-text `single + none`; it must not advertise instruction control.
- Other Alibaba models may still synthesize whole text through the native endpoint, but get no speculative segmented profile.
- Existing OpenAI and custom API profiles and execution paths remain present.

## Scope

Change only the shared API request function, the speech control/profile/schema contract, one focused Node test, README language variants, and the packaged Skill. Do not add the DashScope Python SDK, streaming/SSE, a provider abstraction layer, or profiles for unverified models.

## Verification

Use mocked `fetch` responses to assert the native endpoint, nested request body, API-key header, audio URL download, and written bytes. Also verify profile resolution and that OpenAI request behavior remains unchanged. Run the existing Node tests, typecheck, package dry-run, and `git diff --check`; do not make a paid API call.
