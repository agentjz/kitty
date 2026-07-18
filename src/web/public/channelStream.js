import { marked } from "/vendor/marked.esm.js";

const MERGEABLE_KINDS = new Set(["assistant", "reasoning"]);
const MARKDOWN_KINDS = new Set(["assistant", "reasoning", "final", "inbound"]);
const TOOL_KINDS = new Set(["tool_call", "tool_progress", "tool_result", "tool_error"]);
let streamMessages = {};

export function initializeChannelStreams(messages) {
  streamMessages = messages;
}

export function appendChannelEvent(host, item) {
  const stream = document.querySelector(`#${host}-stream`);
  if (!stream) return;
  const followLatest = isFollowingLatest(stream);
  stream.querySelector(".stream-empty")?.remove();
  const kind = item.kind || "status";
  const presentation = item.presentation;
  const message = presentation?.detail ?? item.text ?? (TOOL_KINDS.has(kind) ? "" : item.payload ?? streamMessages.eventUpdated ?? "");
  const format = presentation?.format ?? (MARKDOWN_KINDS.has(kind) ? "markdown" : "text");
  const last = stream.lastElementChild;

  if (MERGEABLE_KINDS.has(kind) && last?.dataset.kind === kind && last.dataset.session === String(item.sessionId || "")) {
    const body = last.querySelector(".stream-body");
    body.dataset.content = `${body.dataset.content || ""}${message}`;
    renderStreamBody(body, body.dataset.content, "markdown");
  } else {
    stream.append(createEventElement(item, kind, message, format));
  }

  if (followLatest) stream.scrollTop = stream.scrollHeight;
}

function createEventElement(item, kind, message, format) {
  const presentation = item.presentation;
  const element = document.createElement("article");
  element.className = `stream-event stream-${kind}${presentation?.state ? ` stream-state-${presentation.state}` : ""}`;
  element.dataset.kind = kind;
  element.dataset.session = String(item.sessionId || "");
  const label = presentation?.title || eventLabel(kind, item.toolName);
  element.innerHTML = `<div class="stream-meta"><span>${escapeHtml(label)}</span><time>${escapeHtml(formatTime(item.createdAt))}</time></div><div class="stream-body"></div>`;
  const body = element.querySelector(".stream-body");
  body.dataset.content = String(message);
  renderStreamBody(body, String(message), format);
  return element;
}

function renderStreamBody(body, content, format) {
  body.replaceChildren();
  if (!content) {
    body.classList.add("d-none");
    return;
  }
  body.classList.remove("d-none");
  if (format === "markdown") {
    body.innerHTML = sanitizeMarked(content);
    return;
  }
  const element = document.createElement(format === "preformatted" ? "pre" : "p");
  element.textContent = content;
  body.append(element);
}

function isFollowingLatest(stream) {
  return stream.scrollHeight - stream.scrollTop - stream.clientHeight <= 48;
}

function eventLabel(kind, toolName) {
  const labels = {
    inbound: streamMessages.inbound,
    status: streamMessages.status,
    reasoning: streamMessages.reasoning,
    assistant: streamMessages.assistant,
    final: streamMessages.final,
    tool_call: streamMessages.toolCall,
    tool_progress: streamMessages.toolProgress,
    tool_result: streamMessages.toolResult,
    tool_error: streamMessages.toolError,
    error: streamMessages.error,
  };
  return toolName ? `${labels[kind] || kind} · ${toolName}` : labels[kind] || kind;
}

function sanitizeMarked(markdown) {
  const template = document.createElement("template");
  template.innerHTML = marked.parse(markdown);
  const allowed = new Set(["P", "BR", "STRONG", "EM", "CODE", "PRE", "UL", "OL", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "A", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
  for (const element of [...template.content.querySelectorAll("*")]) {
    if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); continue; }
    const href = element.tagName === "A" ? element.getAttribute("href") : null;
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (element.tagName === "A" && href && /^(https?:|mailto:)/i.test(href)) {
      element.setAttribute("href", href);
      element.setAttribute("rel", "noreferrer");
      element.setAttribute("target", "_blank");
    }
  }
  return template.innerHTML;
}

function formatTime(value) { return value ? new Date(value).toLocaleTimeString() : new Date().toLocaleTimeString(); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
