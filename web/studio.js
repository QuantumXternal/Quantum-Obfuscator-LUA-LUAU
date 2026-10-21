import "./studio.css";
import { initHealth, initLayout, toast } from "./ui.js";
import { initDashboard } from "./pages/dashboard.js";
import { initAnalyzer } from "./pages/analyzer.js";
import { initObfuscator } from "./pages/obfuscator.js";
import { initDocs } from "./pages/docs.js";

const INITIALIZERS = {
  dashboard: initDashboard,
  analyzer: initAnalyzer,
  obfuscator: initObfuscator,
  docs: initDocs,
};

function boot() {
  initLayout();
  initHealth();
  const page = document.body.dataset.page || "dashboard";
  const init = INITIALIZERS[page];
  if (!init) {
    console.error(`Unknown Studio page: ${page}`);
    return;
  }
  try {
    init();
  } catch (err) {
    console.error(err);
    toast(err?.message || "Studio failed to initialize.", "error", 6000);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.name === "AbortError") return;
  console.error("Unhandled Studio error", event.reason);
  toast(event.reason?.message || "An unexpected error occurred.", "error", 5200);
});
