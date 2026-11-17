export const THEME_KEY = "folio-theme";

export type Theme = "light" | "dark";

const THEME_EVENT = "folio-theme";

let cachedTheme: Theme = "light";

export function themeFromStorage(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function subscribeTheme(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

export function readThemeSnapshot(): Theme {
  const next = themeFromStorage(
    localStorage.getItem(THEME_KEY),
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  cachedTheme = next;
  return cachedTheme;
}

export function emptyThemeSnapshot(): Theme {
  return "light";
}

export function writeTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  cachedTheme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

export const THEME_BOOT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}if(t==="dark")document.documentElement.classList.add("dark");document.documentElement.style.colorScheme=t;}catch(e){}})();`;
