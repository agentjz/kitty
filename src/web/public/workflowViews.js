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

export function renderExtensionSettings(extensions, values) {
  document.querySelector("#extension-switches").innerHTML = extensions.map((extension) => `
    <label class="switch-item" for="ext-${extension.id}">
      <span><strong>${escapeHtml(extension.id)}</strong><small>${escapeHtml(extension.summary)}</small></span>
      <span class="form-check form-switch"><input class="form-check-input" type="checkbox" id="ext-${extension.id}" data-env="${escapeAttribute(extension.envKey)}" ${values[extension.envKey] === "true" ? "checked" : ""}></span>
    </label>`).join("");
}

export function renderSettings(selector, runtimeFields, values) {
  document.querySelector(selector).innerHTML = runtimeFields.map((field) => {
    const id = `env-${field.envKey}`;
    const current = values[field.envKey] ?? "";
    const control = field.options
      ? `<select class="form-select" id="${id}" data-env="${escapeAttribute(field.envKey)}">${field.options.map((option) => `<option value="${escapeAttribute(option.value)}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`
      : `<input class="form-control" id="${id}" data-env="${escapeAttribute(field.envKey)}" type="${field.control}" ${field.control === "number" ? "step=\"1\"" : ""} value="${escapeAttribute(current)}">`;
    return `<div><label class="form-label" for="${id}">${escapeHtml(field.label)}</label>${control}</div>`;
  }).join("");
}

export function renderSkillList(skills, emptyMessage) {
  document.querySelector("#skill-list").innerHTML = skills.map((skill) => `
    <button class="skill-item" type="button" data-action="open-skill" data-name="${escapeAttribute(skill.name)}">
      <span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description)}</small></span>
    </button>`).join("") || `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
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
