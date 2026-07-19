# Chat Bubbles authoring

Author `participants[]` and `messages[]` directly. This Template does not use scenes, lines, a camera, or a virtual canvas.

Each participant needs a unique `id`, display `name`, and `side` (`left` or `right`). `avatar` is optional and must be a project-relative file such as `assets/me.png`; without it, the runtime uses the first character of the participant name.

v1 supports only `type: "text"`. Image, audio, file, sticker, recall, and application-skin messages are rejected.

Messages stay in authored order and must reference an existing participant. For text-only projects, `durationMs` is optional: the default is 140 ms per Unicode character, clamped to 1.2–4 seconds. `pauseAfterMs` defaults to 400 ms. You may instead provide a complete `start` and `end` pair, but must not combine it with `durationMs`.

For media or TTS, omit authored timing. `yumoframe resolve` aligns message text from the reviewed `transcript.json`; transcript timing wins over text-duration defaults. The generated Project contains final clocks, participant layout, and scroll offsets.

```json
{
  "version": "0.1.0",
  "template": "chat-bubbles",
  "participants": [
    { "id": "friend", "name": "朋友", "side": "left", "avatar": "assets/friend.png" },
    { "id": "me", "name": "我", "side": "right" }
  ],
  "messages": [
    {
      "id": "message-001",
      "speaker": "friend",
      "type": "text",
      "text": "你到哪了？",
      "pauseAfterMs": 500
    },
    {
      "id": "message-002",
      "speaker": "me",
      "type": "text",
      "text": "刚准备出门。",
      "durationMs": 1600
    }
  ]
}
```

Run `yumoframe resolve`, `yumoframe validate`, and review Studio before rendering. `project.json` is generated and must not be edited.
