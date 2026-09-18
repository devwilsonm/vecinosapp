// @ts-nocheck
const themeStorageKey = "vecinosapp-theme";
const themeRoot = document.documentElement;
const isAuthenticated = themeRoot.dataset.authenticated === "true";
const serverThemeAuthoritative = themeRoot.dataset.themeServer === "true";

function applyTheme(theme) {
  const isDark = theme === "dark";
  themeRoot.dataset.theme = isDark ? "dark" : "light";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const label = isDark ? "Activar tema claro" : "Activar tema oscuro";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  });
  document.dispatchEvent(new CustomEvent("vecinosapp:theme-changed", { detail: { theme: isDark ? "dark" : "light" } }));
}

let savedTheme = themeRoot.dataset.theme === "dark" ? "dark" : "light";
if (!isAuthenticated && !serverThemeAuthoritative) {
  try {
    if (localStorage.getItem(themeStorageKey) === "dark") savedTheme = "dark";
  } catch {
    savedTheme = "light";
  }
}
applyTheme(savedTheme);

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";

document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", async () => {
    const nextTheme = themeRoot.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Continue without persistence when browser storage is unavailable.
    }
    document.cookie = `vecinosapp_theme=${nextTheme}; Max-Age=31536000; Path=/; SameSite=Lax`;
    if (!isAuthenticated) return;
    try {
      const response = await fetch("/theme", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ _csrf: csrfToken, theme: nextTheme })
      });
      if (!response.ok) throw new Error("No se pudo guardar el tema.");
    } catch (error) {
      console.error(error);
    }
  });
});