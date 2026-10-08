export {};

const filterForm = document.querySelector<HTMLFormElement>("form[data-partial-filter]");
const results = document.querySelector<HTMLElement>("[data-partial-results]");
let activeRequest: AbortController | null = null;

async function updateResults(url: URL, restoreFilters = false, addHistory = true) {
  if (!filterForm || !results) return;
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = window.setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), 30_000);
  document.querySelector("[data-partial-error]")?.remove();
  document.dispatchEvent(new Event("vecinosapp:loading-start"));
  try {
    const response = await fetch(url.href, {
      headers: { Accept: "text/html" },
      signal: controller.signal
    });
    if (response.redirected && new URL(response.url).pathname !== url.pathname) {
      window.location.assign(response.url);
      return;
    }
    if (!response.ok) throw new Error("No se pudo actualizar la consulta. Inténtalo nuevamente.");
    const html = await response.text();
    if (controller.signal.aborted) return;
    const page = new DOMParser().parseFromString(html, "text/html");
    const nextResults = page.querySelector("[data-partial-results]");
    const nextForm = page.querySelector<HTMLFormElement>("form[data-partial-filter]");
    if (!nextResults || !nextForm) throw new Error("No se pudo actualizar la consulta. Vuelve a intentarlo.");
    document.dispatchEvent(new Event("vecinosapp:before-results-update"));
    results.replaceChildren(...Array.from(nextResults.childNodes));
    if (restoreFilters) {
      const fields = filterForm.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
      const nextFields = nextForm.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
      fields.forEach((field, index) => {
        if (nextFields[index]) {
          field.value = nextFields[index].value;
          if (field instanceof HTMLInputElement) field.setCustomValidity("");
        }
      });
    }
    document.title = page.title;
    if (addHistory && url.href !== window.location.href) {
      history.pushState({ ...history.state, partialPath: url.pathname }, "", url.href);
    }
    document.dispatchEvent(new Event("vecinosapp:results-updated"));
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason?.name !== "TimeoutError") return;
    const alert = document.createElement("div");
    alert.className = "alert danger";
    alert.dataset.partialError = "";
    alert.setAttribute("role", "alert");
    alert.textContent = controller.signal.reason?.name === "TimeoutError"
      ? "La consulta tardó demasiado. Inténtalo nuevamente."
      : "No se pudo actualizar la consulta. Inténtalo nuevamente.";
    results.before(alert);
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) activeRequest = null;
    document.dispatchEvent(new Event("vecinosapp:loading-end"));
  }
}

if (filterForm && results) {
  history.replaceState({ ...history.state, partialPath: location.pathname }, "");
  document.addEventListener("submit", (event: SubmitEvent) => {
    if (event.target !== filterForm || event.defaultPrevented) return;
    event.preventDefault();
    const url = new URL(filterForm.action || location.href);
    url.search = "";
    const data = new FormData(filterForm);
    const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null;
    if (submitter?.name) data.append(submitter.name, submitter.value);
    data.forEach((value, key) => { if (typeof value === "string") url.searchParams.append(key, value); });
    void updateResults(url);
  });
  document.addEventListener("click", (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self") || link.getAttribute("href")?.startsWith("#")) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash) return;
    if (!filterForm.contains(link) && !results.contains(link)) return;
    event.preventDefault();
    void updateResults(url, true);
  });
  window.addEventListener("popstate", () => {
    if (history.state?.partialPath === location.pathname) void updateResults(new URL(location.href), true, false);
  });
}