import { copyToClipboard, toast } from "../ui.js";

export function initDocs() {
  document.querySelectorAll("[data-copy-code]").forEach((button) => {
    button.addEventListener("click", async () => {
      const block = button.closest(".code-block");
      const code = block?.querySelector("code")?.textContent || "";
      try {
        await copyToClipboard(code);
        const original = button.textContent;
        button.textContent = "Copied";
        button.classList.add("is-copied");
        setTimeout(() => {
          button.textContent = original;
          button.classList.remove("is-copied");
        }, 1500);
      } catch (err) {
        toast(err.message || String(err), "error");
      }
    });
  });

  const links = Array.from(document.querySelectorAll(".docs-toc a[href^='#']"));
  const targets = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  if (links.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible.length) return;
        const id = `#${visible[0].target.id}`;
        links.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === id));
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 1] },
    );
    targets.forEach((target) => observer.observe(target));
  }
}
