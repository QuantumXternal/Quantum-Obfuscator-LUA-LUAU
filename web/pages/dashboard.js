import { setPendingSource } from "../state.js";
import {
  byteLength,
  formatBytes,
  setupDropZone,
  setupFileInput,
  toast,
} from "../ui.js";

export function initDashboard() {
  const drop = document.querySelector("[data-dashboard-drop]");
  const input = document.querySelector("[data-dashboard-file]");
  const picker = document.querySelector("[data-dashboard-pick]");

  const acceptFile = ({ name, text, bytes }) => {
    if (!text.trim()) {
      toast("That file is empty.", "error");
      return;
    }
    const stored = setPendingSource(text);
    if (!stored) {
      toast("This script is too large for the browser handoff. Open the analyzer and paste it instead.", "error", 5200);
      return;
    }
    toast(`${name || "Script"} loaded (${formatBytes(bytes || byteLength(text))}). Opening analyzer…`, "success");
    setTimeout(() => {
      window.location.href = "/analyzer";
    }, 350);
  };

  setupDropZone(drop, acceptFile, { acceptExtensions: [".lua", ".luau", ".txt"] });
  setupFileInput(input, acceptFile, { acceptExtensions: [".lua", ".luau", ".txt"] });
  picker?.addEventListener("click", () => input?.click());
  drop?.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    input?.click();
  });
  drop?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input?.click();
    }
  });
}
