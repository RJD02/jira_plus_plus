import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./providers/ThemeProvider";

if (import.meta.env.DEV && import.meta.env.VITE_DISABLE_RELOAD_LOOP === "true" && typeof window !== "undefined") {
  const originalReload = window.location.reload.bind(window.location);
  const originalAssign = window.location.assign.bind(window.location);
  const originalReplace = window.location.replace.bind(window.location);
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  const warn = (action: string, detail?: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(`[ReloadGuard] Blocked ${action}`, detail, new Error().stack);
  };

  window.location.reload = () => warn("window.location.reload()");
  window.location.assign = (url: string | URL) => warn("window.location.assign", url);
  window.location.replace = (url: string | URL) => warn("window.location.replace", url);
  window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    warn("history.pushState", url ?? null);
  };
  window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    warn("history.replaceState", url ?? null);
  };

  window.addEventListener("beforeunload", (event) => {
    warn("beforeunload");
    event.preventDefault();
    event.returnValue = "";
  });

  // Preserve a way to trigger manual reload if needed.
  (window as typeof window & {
    __JPP_FORCE_RELOAD__?: () => void;
    __JPP_FORCE_ASSIGN__?: (url: string) => void;
    __JPP_FORCE_REPLACE__?: (url: string) => void;
    __JPP_FORCE_PUSH_STATE__?: (url: string) => void;
    __JPP_FORCE_REPLACE_STATE__?: (url: string) => void;
  }).__JPP_FORCE_RELOAD__ = originalReload;
  (window as typeof window & { __JPP_FORCE_ASSIGN__?: (url: string) => void }).__JPP_FORCE_ASSIGN__ = (url) =>
    originalAssign(url);
  (window as typeof window & { __JPP_FORCE_REPLACE__?: (url: string) => void }).__JPP_FORCE_REPLACE__ = (url) =>
    originalReplace(url);
  (window as typeof window & { __JPP_FORCE_PUSH_STATE__?: (url: string) => void }).__JPP_FORCE_PUSH_STATE__ = (url) =>
    originalPushState(null, "", url);
  (window as typeof window & { __JPP_FORCE_REPLACE_STATE__?: (url: string) => void }).__JPP_FORCE_REPLACE_STATE__ = (url) =>
    originalReplaceState(null, "", url);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
