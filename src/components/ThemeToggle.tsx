import { Moon, Sun } from "lucide-react";
import type { Theme } from "../theme/theme";

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button className="icon-text-button" onClick={onToggle} type="button">
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
