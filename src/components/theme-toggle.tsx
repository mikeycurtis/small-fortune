"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

type Theme = "light" | "dark";

/**
 * The committed theme lives on `<html data-theme>`, written by the inline head
 * script before first paint. That makes the DOM the source of truth, not React
 * state — so we subscribe to it rather than mirroring it, and the button can
 * never disagree with what is actually on screen.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The server cannot know the stored preference; render the neutral label. */
function getServerSnapshot(): Theme | null {
  return null;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing — the choice just won't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === null
          ? "Toggle theme"
          : `Switch to ${theme === "dark" ? "light" : "dark"} theme`
      }
      className="grid size-8 place-items-center rounded-full border border-rule text-ink-soft transition-colors hover:border-olive hover:text-olive"
    >
      <span aria-hidden className="text-[12px] leading-none">
        {theme === "dark" ? "☾" : "☀"}
      </span>
    </button>
  );
}
