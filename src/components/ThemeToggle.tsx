import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme/theme";

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-pressed={theme === "dark"}
      className="theme-switch"
      onClick={onToggle}
      type="button"
    >
      <span className="theme-switch-track">
        <span className="theme-switch-thumb">
          {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
        </span>
      </span>
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
