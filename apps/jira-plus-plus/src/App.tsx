import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef } from "react";
import clsx from "clsx";
import { HomePage } from "./pages/HomePage";
import { ScrumPage } from "./pages/ScrumPage";
import { FocusPage } from "./pages/FocusPage";
import { ManagerPage } from "./pages/ManagerPage";
import { AdminConsolePage } from "./pages/AdminConsole";
import { ReportsPage } from "./pages/ReportsPage";
import { ApolloProvider } from "./providers/ApolloProvider";
import { AuthProvider, useAuth } from "./providers/AuthProvider";
import { ThemeToggle } from "./components/ui/theme-toggle";
import { apolloClient } from "./lib/apollo-client";
import { UserMenu } from "./components/user/UserMenu";
import type { Role } from "./providers/AuthProvider";

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ApolloProvider>
  );
}

function Shell() {
  const { user, phase, login, hasKeycloak } = useAuth();
  const appBrand = import.meta.env.VITE_APP_BRAND ?? "Jira++ Console";
  const navigationItems = useMemo(() => {
    const base = [{ to: "/", label: "Overview" }];
    if (!user) {
      return base;
    }

    const items = [...base, { to: "/scrum", label: "Daily Scrum" }, { to: "/focus", label: "Developer Focus" }];

    if (user.role === "MANAGER" || user.role === "ADMIN") {
      items.push({ to: "/manager", label: "Manager Summary" });
      items.push({ to: "/reports", label: "Reports" });
    }

    if (user.role === "ADMIN") {
      items.push({ to: "/admin", label: "Admin Console" });
    }

    return items;
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-10">
            <h1 className="text-xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
              {appBrand}
            </h1>
            <nav className="hidden items-center gap-1 md:flex">
              {navigationItems.map((item) => (
                <NavLink key={item.to} className={linkClass} to={item.to} end={item.to === "/"}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user ? (
              <UserMenu user={user} />
            ) : (
              <button
                type="button"
                onClick={() => void login()}
                disabled={!hasKeycloak || phase === "checking" || phase === "authenticating"}
                className="rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                title={hasKeycloak ? undefined : "Configure VITE_KEYCLOAK_* in your env to enable sign-in"}
              >
                {hasKeycloak ? (phase === "checking" || phase === "authenticating" ? "Connecting…" : "Sign in") : "Auth not configured"}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="px-6 py-5 sm:px-8">
        <nav className="mb-6 flex gap-2 overflow-x-auto md:hidden">
          {navigationItems.map((item) => (
            <NavLink key={item.to} className={linkClass} to={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/scrum"
            element={
              <RequireAuth>
                <ScrumPage />
              </RequireAuth>
            }
          />
          <Route
            path="/focus"
            element={
              <RequireAuth>
                <FocusPage />
              </RequireAuth>
            }
          />
          <Route
            path="/manager"
            element={
              <RequireRole allowedRoles={["ADMIN", "MANAGER"]}>
                <ManagerPage />
              </RequireRole>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireRole allowedRoles={["ADMIN", "MANAGER"]}>
                <ReportsPage />
              </RequireRole>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireRole allowedRoles={["ADMIN"]}>
                <AdminConsolePage />
              </RequireRole>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function linkClass({ isActive }: { isActive: boolean }) {
  return clsx(
    "rounded-md px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
      : "text-slate-600 hover:bg-slate-900 hover:text-white dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50",
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  return <RequireRole allowedRoles={undefined}>{children}</RequireRole>;
}

function RequireRole({ children, allowedRoles }: { children: JSX.Element; allowedRoles?: Role[] }) {
  const auth = useAuth();
  const { brandName } = useBrand();
  const location = useLocation();
  const route = location.pathname;
  const needsRoleCheck = Boolean(allowedRoles?.length);
  const autoLoginEnabled = import.meta.env.VITE_AUTO_LOGIN_ENABLED !== "false";
  const shouldAuto =
    autoLoginEnabled &&
    auth.hasKeycloak &&
    auth.phase === "anonymous" &&
    auth.autoAttempts < auth.maxAutoAttempts &&
    (!auth.user || (needsRoleCheck && !allowedRoles?.includes(auth.user.role)));

  useAutoLoginGuard({
    route,
    shouldAttempt: shouldAuto,
    phase: auth.phase,
    autoAttempts: auth.autoAttempts,
    maxAutoAttempts: auth.maxAutoAttempts,
    login: auth.login,
    registerAutoAttempt: auth.registerAutoAttempt,
  });

  if (auth.phase === "checking" || auth.phase === "authenticating") {
    return <AuthLoading phase={auth.phase} attempt={auth.autoAttempts} />;
  }

  if (!auth.user) {
    return (
      <ProductAuthGate
        brandName={brandName}
        phase={auth.phase}
        hasKeycloak={auth.hasKeycloak}
        onSignIn={() => void auth.login()}
        autoAttempts={auth.autoAttempts}
        maxAutoAttempts={auth.maxAutoAttempts}
        error={auth.error}
      />
    );
  }

  if (needsRoleCheck && !allowedRoles?.includes(auth.user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function ProductAuthGate({
  brandName,
  phase,
  hasKeycloak,
  onSignIn,
  autoAttempts,
  maxAutoAttempts,
  error,
}: {
  brandName: string;
  phase: string;
  hasKeycloak: boolean;
  onSignIn: () => void;
  autoAttempts: number;
  maxAutoAttempts: number;
  error: string | null;
}) {
  const attemptsLeft = Math.max(0, maxAutoAttempts - autoAttempts);
  const showTroubleshooting = phase === "error" || error;
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{brandName}</p>
      <h2 className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">Sign in to continue</h2>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Connect through Keycloak so we can load your workspace context.
      </p>
      {!hasKeycloak ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200">
          Missing `VITE_KEYCLOAK_*` env vars. Update your `.env` and restart the dev server.
        </div>
      ) : (
        <button
          type="button"
          onClick={onSignIn}
          disabled={phase === "authenticating"}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {phase === "authenticating" ? "Opening Keycloak…" : "Continue with Keycloak"}
        </button>
      )}
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Auto-login attempts used: {autoAttempts}/{maxAutoAttempts} {attemptsLeft === 0 ? "— click the button above to retry." : null}
      </p>
      {showTroubleshooting ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-sm dark:border-slate-700 dark:bg-slate-800/60">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Last authentication error</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{error ?? "Unknown error"}</p>
        </div>
      ) : null}
    </div>
  );
}

function AuthLoading({ phase, attempt }: { phase: string; attempt: number }) {
  const copy = phase === "authenticating" ? "Opening Keycloak…" : "Checking your session…";
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{copy}</p>
      {attempt > 0 ? <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Auto-login attempts: {attempt}</p> : null}
    </div>
  );
}

function useAutoLoginGuard({
  route,
  shouldAttempt,
  phase,
  autoAttempts,
  maxAutoAttempts,
  login,
  registerAutoAttempt,
}: {
  route: string;
  shouldAttempt: boolean;
  phase: string;
  autoAttempts: number;
  maxAutoAttempts: number;
  login: (options?: { prompt?: "login" | "none" }) => Promise<void>;
  registerAutoAttempt: () => void;
}) {
  const suppressedRef = useRef(false);

  useEffect(() => {
    if (!shouldAttempt) {
      suppressedRef.current = false;
      return;
    }
    if (phase !== "anonymous") {
      return;
    }
    if (autoAttempts >= maxAutoAttempts) {
      if (!suppressedRef.current) {
        // eslint-disable-next-line no-console
        console.info("[AuthLoop] auto login suppressed", { route, autoAttempts });
        suppressedRef.current = true;
      }
      return;
    }
    const attemptNumber = autoAttempts + 1;
    registerAutoAttempt();
    // First attempt: prompt=none silently checks for an existing Keycloak session.
    // If a session exists → returns auth code immediately (seamless re-auth).
    // If not → returns login_required, and the next attempt uses prompt=login
    // to show the Keycloak login form directly.
    const prompt = attemptNumber <= 1 ? "none" : "login";
    // eslint-disable-next-line no-console
    console.info("[AuthLoop] auto login attempt", { attempt: attemptNumber, route, prompt });
    login({ prompt }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[AuthLoop] auto login failed", error);
    });
  }, [autoAttempts, login, maxAutoAttempts, phase, registerAutoAttempt, route, shouldAttempt]);
}

function useBrand() {
  const brandName = import.meta.env.VITE_APP_BRAND ?? "Jira++ Console";
  return { brandName };
}
