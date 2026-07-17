import type { WeixinClassifiedMessage, WeixinRawMessage } from "./types.js";

export function classifyWeixinMessage(message: WeixinRawMessage, allowedUserIds: readonly string[]): WeixinClassifiedMessage {
  const userId = String(message.from_user_id ?? "").trim();
  const recipient = String(message.to_user_id ?? "").trim();
  const groupId = String(message.group_id ?? "").trim();
  const items = Array.isArray(message.item_list) ? message.item_list : [];
  const messageType = integer(message.message_type);
  const text = items.map((item) => item.type === 1 ? String(item.text_item?.text ?? "").trim() : item.type === 3 ? String(item.voice_item?.text ?? "").trim() : "").find(Boolean) ?? "";
  if (groupId) return { kind: "ignore", reason: "group_chat_unsupported", userId: userId || undefined, raw: message };
  if (messageType === 2) return { kind: "outbound_echo", peerKey: `weixin:private:${recipient}`, userId: recipient, messageId: integer(message.message_id), seq: integer(message.seq), raw: message };
  if (!userId || !allowedUserIds.includes(userId)) return { kind: "ignore", reason: "unauthorized_user", userId: userId || undefined, raw: message };
  if (messageType !== 0 && messageType !== 1) return { kind: "ignore", reason: "unsupported_message", userId, raw: message };
  const base = { peerKey: `weixin:private:${userId}`, userId, messageId: integer(message.message_id), seq: integer(message.seq), contextToken: String(message.context_token ?? "").trim(), text, raw: message };
  const image = items.find((item) => item.type === 2 && item.image_item?.media)?.image_item?.media;
  if (image) return { ...base, kind: "private_image_message", mediaKind: "image", media: image };
  const file = items.find((item) => item.type === 4 && item.file_item?.media)?.file_item;
  if (file?.media) return { ...base, kind: "private_file_message", mediaKind: "file", media: file.media, fileName: optional(file.file_name), fileSize: optionalNumber(file.len) };
  const video = items.find((item) => item.type === 5 && item.video_item?.media)?.video_item?.media;
  if (video) return { ...base, kind: "private_video_message", mediaKind: "video", media: video };
  const voice = items.find((item) => item.type === 3 && item.voice_item?.media)?.voice_item;
  if (voice?.media) return { ...base, kind: "private_voice_message", mediaKind: "voice", media: voice.media, voiceTranscript: optional(voice.text), sampleRate: optionalNumber(voice.sample_rate), voice };
  if (text) return { ...base, kind: "private_text_message" };
  return { kind: "ignore", reason: items.length ? "unsupported_message" : "empty_message", userId, raw: message };
}

function integer(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0; }
function optional(value: unknown): string | undefined { const text = typeof value === "string" ? value.trim() : ""; return text || undefined; }
function optionalNumber(value: unknown): number | undefined { const number = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10); return Number.isFinite(number) ? Math.trunc(number) : undefined; }
