export function localizeDocument(locale, messages) {
  document.documentElement.lang = locale;
  document.title = messages.pageTitle;
  for (const element of document.querySelectorAll("[data-message]")) {
    element.textContent = resolveMessage(messages, element.dataset.message);
  }
  for (const element of document.querySelectorAll("[data-message-placeholder]")) {
    element.placeholder = resolveMessage(messages, element.dataset.messagePlaceholder);
  }
  for (const element of document.querySelectorAll("[data-message-title]")) {
    element.title = resolveMessage(messages, element.dataset.messageTitle);
    element.setAttribute("aria-label", element.title);
  }
}

export function renderCapabilitySettings(capabilities, messages) {
  const visibleCapabilities = capabilities.filter((capability) => capability.kind !== "skill");
  const ready = visibleCapabilities.filter((capability) => capability.status === "ready").length;
  const disabled = visibleCapabilities.filter((capability) => capability.status === "disabled").length;
  const attention = visibleCapabilities.length - ready - disabled;
  document.querySelector("#capability-overview").innerHTML = [
    ["ready", resolveMessage(messages, "capabilities.overviewReady", { count: ready })],
    ["attention", resolveMessage(messages, "capabilities.overviewAttention", { count: attention })],
    ["disabled", resolveMessage(messages, "capabilities.overviewDisabled", { count: disabled })],
  ].map(([kind, label]) => `<span class="overview-${kind}"><strong>${escapeHtml(label)}</strong></span>`).join("");
  const groups = [
    ["builtin", messages.capabilities.builtinGroup, messages.capabilities.builtinGroupHint],
    ["external", messages.capabilities.externalGroup, messages.capabilities.externalGroupHint],
  ];
  document.querySelector("#capability-groups").innerHTML = groups.map(([group, label, hint]) => {
    const items = visibleCapabilities.filter((capability) => (
      group === "external" ? capability.kind === "mcp" || capability.kind === "web"
        : capability.kind === "core" || capability.kind === "builtin"
    ));
    if (items.length === 0) return "";
    return `<section class="capability-section" data-capability-group="${group}"><div class="section-heading"><h2>${escapeHtml(label)}</h2><p>${escapeHtml(hint)}</p></div><div class="capability-list">${items.map((capability) => {
      const status = messages.capabilities.status[capability.status] || capability.status;
      const action = capability.enabled ? messages.common.stop : messages.common.start;
      const presentation = messages.capabilities.catalog[capability.id] || { name: capability.label, summary: capability.summary };
      const statusHelp = messages.capabilities.statusHelp[capability.status] || "";
      const source = messages.capabilities.installation[capability.installationSource] || capability.installationSource;
      const control = capability.canDisable
        ? `<label class="ui-switch"><input class="ui-switch-input" type="checkbox" role="switch" data-action="toggle-capability" data-capability="${escapeAttribute(capability.id)}" data-enabled="${String(capability.enabled)}" aria-label="${escapeAttribute(`${presentation.name}: ${action}`)}"${capability.enabled ? " checked" : ""}><span class="ui-switch-track" aria-hidden="true"><span class="ui-switch-thumb"></span></span></label>`
        : `<span class="capability-fixed"><i class="bi bi-lock-fill" aria-hidden="true"></i>${escapeHtml(messages.capabilities.alwaysOn)}</span>`;
      const detailRows = [
        [messages.capabilities.sourceLabel, `${capability.installed ? messages.capabilities.installation.installed : messages.capabilities.installation.unavailable} · ${source}`],
        capability.toolNames.length > 0 ? [messages.capabilities.toolsLabel, capability.toolNames.join(", ")] : null,
        capability.message ? [messages.capabilities.runtimeDetail, capability.message] : null,
      ].filter(Boolean);
      return `<article class="capability-item" data-capability-id="${escapeAttribute(capability.id)}"><span class="capability-icon"><i class="bi ${capabilityIcon(capability.id)}" aria-hidden="true"></i></span><div class="capability-copy"><div class="capability-heading"><strong>${escapeHtml(presentation.name)}</strong><span class="capability-status status-${escapeAttribute(capability.status)}">${escapeHtml(status)}</span></div><p>${escapeHtml(presentation.summary)}</p><small class="capability-status-help">${escapeHtml(statusHelp)}</small><details class="capability-details"><summary>${escapeHtml(messages.capabilities.details)}</summary><dl>${detailRows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></details></div><div class="capability-control">${control}</div></article>`;
    }).join("")}</div></section>`;
  }).join("");
}

export function renderSettings(selector, runtimeFields, values) {
  document.querySelector(selector).innerHTML = runtimeFields.map((field) => {
    const id = `env-${field.envKey}`;
    const current = values[field.envKey] ?? "";
    const control = field.options
      ? `<select class="form-select" id="${id}" data-env="${escapeAttribute(field.envKey)}">${field.options.map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`
      : `<input class="form-control" id="${id}" data-env="${escapeAttribute(field.envKey)}" type="${field.control}"${field.min !== undefined ? ` min="${escapeAttribute(field.min)}"` : ""}${field.max !== undefined ? ` max="${escapeAttribute(field.max)}"` : ""}${field.control === "number" ? ` step="${escapeAttribute(field.step ?? 1)}"` : ""}${field.required ? " required" : ""} value="${escapeAttribute(current)}">`;
    return `<div><label class="form-label" for="${id}">${escapeHtml(field.label)}</label>${control}${field.hint ? `<div class="form-text">${escapeHtml(field.hint)}</div>` : ""}</div>`;
  }).join("");
}

export function renderSkillList(skills, messages) {
  document.querySelector("#skill-list").innerHTML = skills.map((skill) => `
    <button class="skill-item" type="button" data-action="open-skill" data-name="${escapeAttribute(skill.name)}">
      <span class="skill-item-icon"><i class="bi bi-journal-code" aria-hidden="true"></i></span>
      <span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description)}</small><small class="skill-package-facts">${escapeHtml(resolveMessage(messages, "skills.resources", { count: skill.health.resourceCount }))} · ${escapeHtml(resolveMessage(messages, "skills.commands", { count: skill.health.dependencyCount }))}</small></span>
      <i class="bi bi-chevron-right" aria-hidden="true"></i>
    </button>`).join("") || `<div class="empty-state">${escapeHtml(messages.skills.empty)}</div>`;
}

function capabilityIcon(id) {
  return ({
    "core-tools": "bi-terminal", todo: "bi-check2-square", scheduler: "bi-clock-history", worktree: "bi-diagram-3",
    background: "bi-hourglass-split", documents: "bi-file-earmark-text", media: "bi-images", skills: "bi-journal-code",
    web: "bi-globe2", playwright: "bi-browser-chrome",
  })[id] || "bi-puzzle";
}

export function resolveMessage(messages, path, values = {}) {
  const template = path.split(".").reduce((current, part) => current?.[part], messages);
  return String(template ?? path).replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (placeholder, name) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder
  ));
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function escapeAttribute(value) {
  return escapeHtml(value);
}
