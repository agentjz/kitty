import { appendChannelEvent, appendChannelHistory, initializeChannelStreams } from "/channelStream.js";
import { escapeAttribute, escapeHtml, localizeDocument, renderExtensionSettings, renderSettings, renderSkillList, resolveMessage } from "/workflowViews.js";

const params = new URLSearchParams(location.search);
const token = params.get("token") || sessionStorage.getItem("kitty-console-token") || "";
if (params.has("token")) {
  sessionStorage.setItem("kitty-console-token", token);
  history.replaceState(null, "", `${location.pathname}${location.hash}`);
}

const ENV = {
  provider: "KITTY_PROVIDER",
  model: "KITTY_MODEL",
  baseUrl: "KITTY_BASE_URL",
  apiKey: "KITTY_API_KEY",
  telegramToken: "KITTY_TELEGRAM_TOKEN",
  telegramUsers: "KITTY_TELEGRAM_ALLOWED_USER_IDS",
  weixinUsers: "KITTY_WEIXIN_ALLOWED_USER_IDS",
};

let state;
let eventSource;
let eventConnectionFailed = false;
const observedChannelStatus = new Map();
const loadedChannelHistory = new Set();
const loadingChannelHistory = new Map();

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || (state ? message("common.requestFailed", { status: response.status }) : String(response.status)));
  }
  return body;
}

async function refresh() {
  state = await api("/api/bootstrap");
  render();
}

function render() {
  const values = state.configuration.values;
  localizeDocument(state.locale, state.messages);
  text("#kitty-version", `v${state.brand.version}`);
  text("#kitty-wordmark-kitty", state.brand.wordmark.kitty);
  text("#kitty-wordmark-agent", state.brand.wordmark.agent);
  text("#config-location", state.configuration.file);
  text("#model-summary", `${values[ENV.provider] || message("common.notConfigured")} · ${values[ENV.model] || message("common.notConfigured")}`);
  text("#plugins-summary", `${state.extensions.filter((extension) => values[extension.envKey] === "true").length} / ${state.extensions.length}`);
  text("#weixin-summary", describeChannel(state.channels.weixin, state.channels.weixinLogin?.status));
  text("#telegram-summary", describeChannel(state.channels.telegram));
  document.querySelector("#open-web-shell").href = `/web?token=${encodeURIComponent(token)}`;

  document.querySelector("#provider-preset").innerHTML = `<option value="">${escapeHtml(message("common.custom"))}</option>` + state.providers
    .map((item) => `<option value="${escapeAttribute(item.provider)}">${escapeHtml(item.label)}</option>`).join("");
  const preset = state.providers.find((item) => item.provider === values[ENV.provider]
    && item.model === values[ENV.model] && item.baseUrl === values[ENV.baseUrl]);
  value("#provider-preset", preset?.provider ?? "");
  value("#model-provider", values[ENV.provider]);
  value("#model-name", values[ENV.model]);
  value("#model-url", values[ENV.baseUrl]);
  value("#model-key", values[ENV.apiKey]);
  document.querySelector("#current-model-facts").innerHTML = [
    [message("config.provider"), values[ENV.provider] || message("common.notConfigured")],
    [message("config.model"), values[ENV.model] || message("common.notConfigured")],
    [message("config.baseUrl"), values[ENV.baseUrl] || message("common.notConfigured")],
    [message("config.apiKey"), values[ENV.apiKey] ? message("config.currentLoaded") : message("common.notConfigured")],
  ].map(([label, current]) => `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(current)}</strong></span>`).join("");

  value("#weixin-users", values[ENV.weixinUsers]);
  value("#telegram-users", values[ENV.telegramUsers]);
  value("#telegram-token", values[ENV.telegramToken]);
  renderChannels(state.channels, false);
  renderExtensionSettings(state.extensions, values);
  renderSettings("#model-settings", state.messages.runtime.modelFields, values);
  renderSettings("#other-settings", state.messages.runtime.otherFields, values);
  renderSkillList(state.skills, message("skills.empty"));
  initializeChannelStreams({ ...state.messages.stream, eventUpdated: state.messages.common.eventUpdated });
  syncWorkflowFromLocation();
}

function describeChannel(channel, loginStatus) {
  const service = state.messages.status[channel?.status] || channel?.status || state.messages.status.unknown;
  if (!loginStatus || loginStatus === "idle") return service;
  return `${service} · ${state.messages.login[loginStatus] || loginStatus}`;
}

function renderChannels(channels, publishChanges = true) {
  for (const name of ["weixin", "telegram"]) {
    const channel = channels[name];
    const element = document.querySelector(`#${name}-status`);
    const label = state.messages.status[channel.status] || channel.status;
    element.textContent = label;
    element.className = `status-pill status-${channel.status}`;
    text(`#${name}-summary`, name === "weixin" ? describeChannel(channel, channels.weixinLogin?.status) : describeChannel(channel));
    if (publishChanges && observedChannelStatus.get(name) !== channel.status) {
      observedChannelStatus.set(name, channel.status);
      appendChannelEvent(name, {
        kind: channel.status === "failed" ? "error" : "status",
        text: channel.error || message("common.serviceState", { status: label }),
        createdAt: new Date().toISOString(),
      });
    } else if (!observedChannelStatus.has(name)) {
      observedChannelStatus.set(name, channel.status);
    }
  }

  const login = channels.weixinLogin;
  const qr = document.querySelector("#weixin-qr");
  if (login.qr) {
    const loginLabel = state.messages.login[login.status] || login.status;
    qr.innerHTML = `<div class="qr-content"><span class="status-pill status-starting">${escapeHtml(loginLabel)}</span>${login.qrImage
      ? `<img class="weixin-qr" src="${escapeAttribute(login.qrImage)}" alt="${escapeAttribute(message("weixin.qrAlt"))}" width="260" height="260">`
      : `<span>${escapeHtml(message("weixin.qrGenerating"))}</span>`}</div>`;
  } else if (login.error) {
    qr.innerHTML = `<div class="inline-result result-error">${escapeHtml(login.error)}</div>`;
  } else if (login.status === "connected") {
    qr.innerHTML = `<div class="inline-result result-success"><i class="bi bi-check-circle"></i>${escapeHtml(message("weixin.connected"))}</div>`;
  } else {
    qr.replaceChildren();
  }
}

function openWorkflow(name, updateLocation = true) {
  document.querySelector("#workflow-home").classList.add("d-none");
  document.querySelector("#workflow-detail").classList.remove("d-none");
  for (const panel of document.querySelectorAll("[data-workflow-panel]")) {
    panel.classList.toggle("d-none", panel.dataset.workflowPanel !== name);
  }
  if (updateLocation && location.hash !== `#${name}`) history.pushState(null, "", `#${name}`);
  if (name === "weixin" || name === "telegram") void loadChannelHistory(name);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function backHome(updateLocation = true) {
  document.querySelector("#workflow-detail").classList.add("d-none");
  document.querySelector("#workflow-home").classList.remove("d-none");
  if (updateLocation && location.hash) history.pushState(null, "", location.pathname);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function syncWorkflowFromLocation() {
  const name = location.hash.slice(1);
  const known = [...document.querySelectorAll("[data-workflow-panel]")].some((panel) => panel.dataset.workflowPanel === name);
  if (known) openWorkflow(name, false);
  else backHome(false);
}

async function loadChannelHistory(host) {
  if (loadedChannelHistory.has(host)) return;
  const pending = loadingChannelHistory.get(host);
  if (pending) return pending;
  const request = api(`/api/channels/${host}/history`)
    .then((result) => {
      appendChannelHistory(host, result.items);
      loadedChannelHistory.add(host);
    })
    .catch((error) => {
      appendChannelEvent(host, { kind: "error", text: error.message, createdAt: new Date().toISOString() });
    })
    .finally(() => loadingChannelHistory.delete(host));
  loadingChannelHistory.set(host, request);
  return request;
}

window.addEventListener("popstate", syncWorkflowFromLocation);

document.addEventListener("click", async (event) => {
  const workflow = event.target.closest("[data-open-workflow]");
  if (workflow) return openWorkflow(workflow.dataset.openWorkflow);
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "back-home") backHome();
    if (action === "probe-provider") await probeProvider(button);
    if (action === "probe-telegram") await probeTelegram(button);
    if (action === "weixin-login") await runButton(button, async () => {
      await api("/api/weixin/login", { method: "POST", body: "{}" });
      appendChannelEvent("weixin", { kind: "status", text: message("weixin.waitingLogin"), createdAt: new Date().toISOString() });
    });
    if (action === "weixin-logout") await runButton(button, async () => {
      await api("/api/weixin/logout", { method: "POST", body: "{}" });
      await refresh();
      appendChannelEvent("weixin", { kind: "status", text: message("weixin.credentialsCleared"), createdAt: new Date().toISOString() });
    });
    if (action === "start-channel" || action === "stop-channel") await controlChannel(button, action);
    if (action === "open-skill") await openSkill(button.dataset.name);
  } catch (error) {
    const host = button.dataset.channel;
    if (host) appendChannelEvent(host, { kind: "error", text: error.message, createdAt: new Date().toISOString() });
  }
});

document.querySelector("#provider-preset").addEventListener("change", (event) => {
  const preset = state.providers.find((item) => item.provider === event.target.value);
  if (!preset) return;
  value("#model-provider", preset.provider);
  value("#model-name", preset.model);
  value("#model-url", preset.baseUrl);
  value("#model-key", preset.provider === state.configuration.values[ENV.provider]
    ? state.configuration.values[ENV.apiKey]
    : "");
});

document.querySelector("#model-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const provider = field("#model-provider");
  const apiKey = field("#model-key");
  const values = Object.fromEntries([
    [ENV.provider, provider],
    [ENV.model, field("#model-name")],
    [ENV.baseUrl, field("#model-url")],
    [ENV.apiKey, apiKey],
    ...readSettings("#model-settings"),
  ]);
  await submitConfig(values, "#config-result", "config.saved");
});

document.querySelector("#plugins-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries([...document.querySelectorAll("#extension-switches [data-env]")]
    .map((input) => [input.dataset.env, String(input.checked)]));
  await submitConfig(values, "#plugins-result", "plugins.saved");
});

document.querySelector("#other-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitConfig(Object.fromEntries(readSettings("#other-settings")), "#other-result", "other.saved");
});

document.querySelector("#weixin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitConfig({ [ENV.weixinUsers]: field("#weixin-users") }, "#weixin-config-result", "weixin.saved");
});

document.querySelector("#telegram-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitConfig({
    [ENV.telegramUsers]: field("#telegram-users"),
    [ENV.telegramToken]: field("#telegram-token"),
  }, "#telegram-config-result", "telegram.saved");
});

async function submitConfig(values, resultSelector, successMessagePath, clear = []) {
  try {
    await api("/api/config", { method: "PUT", body: JSON.stringify({ values, clear }) });
    await refresh();
    showResult(resultSelector, message(successMessagePath), true);
  } catch (error) {
    showResult(resultSelector, error.message, false);
  }
}

async function probeProvider(button) {
  await runButton(button, async () => {
    try {
      const result = await api("/api/provider/probe", { method: "POST", body: "{}" });
      const parts = [message("common.connectionSuccess"), result.probe];
      if (result.models !== undefined) parts.push(message("common.models", { count: result.models }));
      parts.push(result.resolvedBaseUrl);
      showResult("#provider-result", parts.join(" · "), true);
    } catch (error) {
      showResult("#provider-result", error.message, false);
    }
  });
}

async function probeTelegram(button) {
  await runButton(button, async () => {
    try {
      const result = await api("/api/telegram/probe", { method: "POST", body: "{}" });
      showResult("#telegram-probe-result", message("telegram.probeSuccess", { identity: result.username || result.id }), true);
    } catch (error) {
      showResult("#telegram-probe-result", error.message, false);
    }
  });
}

async function controlChannel(button, action) {
  const host = button.dataset.channel;
  await runButton(button, async () => {
    const channels = await api(`/api/channels/${host}/${action === "start-channel" ? "start" : "stop"}`, { method: "POST", body: "{}" });
    state.channels = channels;
    renderChannels(channels);
  });
}

async function runButton(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  try { await task(); }
  finally { button.disabled = false; }
}

async function openSkill(name) {
  const result = await api(`/api/skills/${encodeURIComponent(name)}`);
  text("#skill-reader-title", name);
  text("#skill-source", result.source);
  document.querySelector("#skill-reader").classList.remove("d-none");
  document.querySelector("#skill-reader").scrollIntoView({ behavior: "smooth", block: "start" });
}

function startEventStream() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  eventSource.addEventListener("open", () => { eventConnectionFailed = false; });
  eventSource.addEventListener("channels", (event) => {
    state.channels = JSON.parse(event.data);
    renderChannels(state.channels);
  });
  eventSource.addEventListener("transcript", (event) => {
    const item = JSON.parse(event.data);
    appendChannelEvent(item.host, item);
  });
  eventSource.onerror = () => {
    if (eventConnectionFailed) return;
    eventConnectionFailed = true;
    for (const host of ["weixin", "telegram"]) {
      appendChannelEvent(host, { kind: "error", text: message("common.eventDisconnected"), createdAt: new Date().toISOString() });
    }
  };
}

function showResult(selector, content, success) {
  const element = document.querySelector(selector);
  element.className = `inline-result ${success ? "result-success" : "result-error"}`;
  element.innerHTML = `<i class="bi ${success ? "bi-check-circle" : "bi-exclamation-circle"}"></i><span>${escapeHtml(content)}</span>`;
}

function message(path, values = {}) {
  return resolveMessage(state.messages, path, values);
}

function readSettings(selector) {
  return [...document.querySelectorAll(`${selector} [data-env]`)].map((input) => [input.dataset.env, input.value]);
}

function field(selector) { return document.querySelector(selector).value.trim(); }
function value(selector, next) { document.querySelector(selector).value = next ?? ""; }
function text(selector, next) { document.querySelector(selector).textContent = next ?? ""; }
refresh().then(startEventStream).catch((error) => {
  document.querySelector("#workflow-home").innerHTML = `<div class="fatal-error"><p>${escapeHtml(error.message)}</p></div>`;
});
