---
name: agnes-media
description: Generate or edit images and create, resume, and download asynchronous videos with Kitty's Agnes media tools. Use for text-to-image, image editing, text-to-video, image-to-video, keyframe animation, or recovery of an Agnes video task that already has a video_id.
---

# Agnes Media

Use Kitty's configured media provider. Keep generated files inside the project.

## Images

Call `generate_image` once with the prompt. Choose `1K` unless the user needs a larger output. Add `image_urls` only for editing or composition. Return the local artifact path from the tool result.

Do not retry an interrupted image POST automatically. Its remote side effect may have completed even when no result was recorded.

## Videos

1. Call `generate_video` with `operation: "create"` and the generation parameters.
2. Preserve the returned `videoId` and `nextPollAt` in the current task facts.
3. After that time, call `generate_video` with `operation: "poll"` and the same `video_id`.
4. Continue polling only while status is `queued` or `in_progress`. Use `wait_seconds` to wait locally without consuming provider RPM.
5. Finish when the tool returns `completed` with a local artifact path.

Always query with `video_id`. Never derive or use `task_id`.

If create was interrupted before `videoId` became durable, treat the external effect as uncertain and do not submit the same video blindly. If polling or download fails, keep the known `videoId` and retry the read-only poll after the reported delay.

Use `num_frames` values that follow `8n + 1`; use `81` at 24 fps for a short acceptance run. Use width and height divisible by 64.
