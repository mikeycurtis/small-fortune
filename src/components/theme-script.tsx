/**
 * Sets `data-theme` on <html> before first paint so the page never flashes
 * the wrong palette. Runs synchronously in <head>, ahead of hydration —
 * which is also why it is hand-minified string content rather than a module.
 */
const SCRIPT = `(function(){try{var s=localStorage.getItem("sf-theme");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=(s==="light"||s==="dark")?s:(m?"dark":"light")}catch(e){document.documentElement.dataset.theme="light"}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

export const THEME_STORAGE_KEY = "sf-theme";
