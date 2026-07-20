export type Theme = "light" | "dark";

const themeKey = "goxplan.theme";

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem(themeKey);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function saveTheme(theme: Theme) {
  localStorage.setItem(themeKey, theme);
}
