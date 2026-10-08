export {};

const loadingOverlay = document.querySelector<HTMLElement>("[data-loading-overlay]");
const loadingMessage = loadingOverlay?.querySelector<HTMLElement>("[data-loading-message]");
let navigating = false;
let pendingRequests = 0;
const blockedRegions = new Map<HTMLElement, boolean>();

function updateLoader(message = "Cargando…") {
  if (!loadingOverlay) return;
  const busy = navigating || pendingRequests > 0;
  loadingOverlay.hidden = !busy;
  if (loadingMessage) loadingMessage.textContent = message;
  document.querySelector("main")?.setAttribute("aria-busy", String(busy));
  if (busy) {
    document.querySelectorAll<HTMLElement>(".topbar, main").forEach((region) => {
      if (!blockedRegions.has(region)) blockedRegions.set(region, region.inert);
      region.inert = true;
    });
  } else {
    blockedRegions.forEach((wasInert, region) => { region.inert = wasInert; });
    blockedRegions.clear();
  }
}

document.addEventListener("submit", (event: SubmitEvent) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
  const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null;
  const target = submitter?.getAttribute("formtarget") ?? form.target;
  const method = submitter?.getAttribute("formmethod") ?? form.method;
  if ((target && target !== "_self") || method === "dialog") return;
  if (navigating || pendingRequests > 0) {
    event.preventDefault();
    return;
  }
  navigating = true;
  updateLoader(method.toLowerCase() === "get" ? "Cargando…" : "Procesando…");
});

document.addEventListener("click", (event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const destination = new URL(link.href, window.location.href);
  if (destination.origin !== window.location.origin || !["http:", "https:"].includes(destination.protocol)) return;
  if (destination.pathname === window.location.pathname && destination.search === window.location.search && (destination.hash || link.getAttribute("href")?.startsWith("#"))) return;
  if (navigating || pendingRequests > 0) {
    event.preventDefault();
    return;
  }
  navigating = true;
  updateLoader();
});

document.addEventListener("vecinosapp:loading-start", () => {
  pendingRequests += 1;
  updateLoader();
});

document.addEventListener("vecinosapp:loading-end", () => {
  pendingRequests = Math.max(0, pendingRequests - 1);
  updateLoader();
});

window.addEventListener("pageshow", () => {
  navigating = false;
  pendingRequests = 0;
  updateLoader();
});