import { checkHealth } from "./api.js";

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function toast(message, type = "info", timeout = 3600) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.setAttribute("role", type === "error" ? "alert" : "status");
  const dot = document.createElement("span");
  dot.className = "toast-dot";
  const text = document.createElement("span");
  text.textContent = message;
  item.append(dot, text);
  stack.appendChild(item);
  requestAnimationFrame(() => item.classList.add("is-visible"));
  setTimeout(() => {
    item.classList.remove("is-visible");
    setTimeout(() => item.remove(), 220);
  }, timeout);
}

export function initLayout() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".nav-link").forEach((link) => {
    const target = link.dataset.nav;
    const active = target === page;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
  });

  const menu = document.querySelector("[data-menu-toggle]");
  const sidebar = document.querySelector(".sidebar");
  if (menu && sidebar) {
    menu.addEventListener("click", () => {
      const open = sidebar.classList.toggle("is-open");
      menu.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => sidebar.classList.remove("is-open"));
    });
  }
}

export function initHealth() {
  const badges = Array.from(document.querySelectorAll("[data-engine-status]"));
  if (!badges.length) return;
  let stopped = false;
  const update = async () => {
    const health = await checkHealth();
    if (stopped) return;
    const online = !!health?.ok;
    for (const badge of badges) {
      badge.classList.toggle("is-online", online);
      badge.classList.toggle("is-offline", !online);
      badge.querySelectorAll("[data-engine-label]").forEach((el) => {
        el.textContent = online ? "Local engine online" : "Engine offline";
      });
      badge.querySelectorAll("[data-engine-detail]").forEach((el) => {
        el.textContent = online ? "API connected" : "Start the server on :3000";
      });
    }
  };
  update();
  const interval = setInterval(update, 15000);
  window.addEventListener("beforeunload", () => {
    stopped = true;
    clearInterval(interval);
  });
}

export async function readDroppedFile(file, options = {}) {
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
  if (!file) throw new Error("No file was dropped.");
  if (file.size > maxBytes) throw new Error(`File is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`);
  const name = file.name || "script.lua";
  if (options.acceptExtensions) {
    const lower = name.toLowerCase();
    if (!options.acceptExtensions.some((ext) => lower.endsWith(ext))) {
      throw new Error(`Unsupported file type. Expected ${options.acceptExtensions.join(", ")}.`);
    }
  }
  const text = await file.text();
  return { name, text, bytes: file.size };
}

export function setupDropZone(element, onFile, options = {}) {
  if (!element) return;
  const setActive = (active) => element.classList.toggle("is-dragging", active);
  element.addEventListener("dragenter", (event) => {
    event.preventDefault();
    setActive(true);
  });
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setActive(true);
  });
  element.addEventListener("dragleave", (event) => {
    if (event.target === element || !element.contains(event.relatedTarget)) setActive(false);
  });
  element.addEventListener("drop", async (event) => {
    event.preventDefault();
    setActive(false);
    try {
      const file = event.dataTransfer?.files?.[0];
      const result = await readDroppedFile(file, options);
      await onFile(result);
    } catch (err) {
      toast(err.message || String(err), "error");
    }
  });
}

export function setupFileInput(input, onFile, options = {}) {
  if (!input) return;
  input.addEventListener("change", async () => {
    try {
      const result = await readDroppedFile(input.files?.[0], options);
      await onFile(result);
    } catch (err) {
      toast(err.message || String(err), "error");
    } finally {
      input.value = "";
    }
  });
}

export function setButtonBusy(button, busy) {
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent.trim();
    button.classList.add("is-busy");
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
  } else {
    button.classList.remove("is-busy");
    button.removeAttribute("aria-busy");
    button.disabled = false;
    if (button.dataset.idleLabel) {
      button.textContent = button.dataset.idleLabel;
      delete button.dataset.idleLabel;
    }
  }
}

export async function copyToClipboard(text) {
  if (!text) throw new Error("Nothing to copy.");
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function downloadText(filename, text) {
  if (!text) throw new Error("Nothing to download.");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function setText(selector, value) {
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = value;
  });
}

export function setHtml(selector, value) {
  document.querySelectorAll(selector).forEach((el) => {
    el.innerHTML = value;
  });
}

export function byteLength(text) {
  return new TextEncoder().encode(text).length;
}
