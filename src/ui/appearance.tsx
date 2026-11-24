import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

export function AppearanceButton({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Icon size={17} strokeWidth={1.6} />
    </button>
  );
}

export function BrandMark() {
  return (
    <img
      className="brand-mark"
      alt=""
      src={new URL("../site/assets/orbital-logo.webp", import.meta.url).href}
    />
  );
}
