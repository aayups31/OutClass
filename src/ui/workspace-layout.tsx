import React, { useEffect, useRef, useState } from "react";
import "./workspace-layout.css";
export type Layout = {
  sidebar: number;
  assistant: number;
  explorer: number;
  terminal: number;
  panel: number;
  explorerTab: "files" | "courses";
  hideSidebar: boolean;
  hideAssistant: boolean;
  hideExplorer: boolean;
  assistantSide: "left" | "right";
  terminalOpen: boolean;
  terminalMax: boolean;
};
const defaults: Layout = {
  sidebar: 200,
  assistant: 354,
  explorer: 200,
  terminal: 240,
  panel: 220,
  explorerTab: "files",
  hideSidebar: false,
  hideAssistant: false,
  hideExplorer: true,
  assistantSide: "right",
  terminalOpen: false,
  terminalMax: false,
};
const key = "outclass-layout-v3";
function read(): Layout {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "{}");
    // Carry forward resized dimensions, while starting the new workspace with
    // secondary panels closed. Subsequent visibility choices are remembered.
    const sizes = localStorage.getItem(key)
      ? stored
      : JSON.parse(
          localStorage.getItem("outclass-layout-v2") ||
            localStorage.getItem("outclass-layout-v1") ||
            "{}",
        );
    const result = { ...defaults };
    for (const n of [
      "sidebar",
      "assistant",
      "explorer",
      "terminal",
      "panel",
    ] as const) {
      const bounds = {
        sidebar: [180, 340],
        assistant: [280, 650],
        explorer: [120, 320],
        terminal: [140, 650],
        panel: [140, 480],
      }[n];
      if (Number.isFinite(sizes[n]))
        result[n] = Math.max(bounds[0], Math.min(bounds[1], sizes[n]));
    }
    for (const n of [
      "hideSidebar",
      "hideAssistant",
      "hideExplorer",
      "terminalOpen",
      "terminalMax",
    ] as const)
      if (typeof stored[n] === "boolean") result[n] = stored[n];
    if (stored.assistantSide === "left") result.assistantSide = "left";
    if (stored.explorerTab === "courses") result.explorerTab = "courses";
    return result;
  } catch {
    return { ...defaults };
  }
}
export function useWorkspaceLayout() {
  const [layout, setLayout] = useState(read);
  useEffect(() => {
    const sync = () => setLayout(read());
    window.addEventListener("outclass-layout", sync);
    return () => window.removeEventListener("outclass-layout", sync);
  }, []);
  function update(change: Partial<Layout>) {
    const next = { ...read(), ...change };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    setLayout(next);
    window.dispatchEvent(new Event("outclass-layout"));
  }
  return { layout, update, reset: () => update(defaults) };
}
export function Divider({
  label,
  value,
  min,
  max,
  onChange,
  axis = "x",
  reverse = false,
  className = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (size: number) => void;
  axis?: "x" | "y";
  reverse?: boolean;
  className?: string;
}) {
  const start = useRef<{ coordinate: number; value: number } | null>(null);
  const clamp = (n: number) => Math.round(Math.max(min, Math.min(max, n)));
  return (
    <div
      className={`panel-divider ${axis} ${className}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={(e) => {
        start.current = {
          coordinate: axis === "x" ? e.clientX : e.clientY,
          value,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (start.current)
          onChange(
            clamp(
              start.current.value +
                ((axis === "x" ? e.clientX : e.clientY) -
                  start.current.coordinate) *
                  (reverse ? -1 : 1),
            ),
          );
      }}
      onPointerUp={(e) => {
        start.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={() => {
        start.current = null;
      }}
      onKeyDown={(e) => {
        const delta =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? 16
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? -16
              : 0;
        if (delta || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          onChange(
            e.key === "Home"
              ? min
              : e.key === "End"
                ? max
                : clamp(value + delta * (reverse ? -1 : 1)),
          );
        }
      }}
    />
  );
}
