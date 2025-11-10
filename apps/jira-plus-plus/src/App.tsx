import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useMemo } from "react";
import clsx from "clsx";
import { HomePage } from "./pages/HomePage";
import { ScrumPage } from "./pages/ScrumPage";
import { FocusPage } from "./pages/FocusPage";
import { ManagerPage } from "./pages/ManagerPage";
import { AdminConsolePage } from "./pages/AdminConsole";
import { ApolloProvider } from "./providers/ApolloProvider";
import { AuthProvider, useAuth } from "./providers/AuthProvider";
import { ThemeToggle } from "./components/ui/theme-toggle";
import { apolloClient } from "./lib/apollo-client";
import { UserMenu } from "./components/user/UserMenu";

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
  const { user } = useAuth();
  const appBrand = import.meta.env.VITE_APP_BRAND ?? "Nucleus Console";
  const navigationItems = useMemo(() => {
    const base = [{ to: "/", label: "Overview" }];
    if (!user) {
      return base;
    }

    const items = [...base, { to: "/scrum", label: "Daily Scrum" }, { to: "/focus", label: "Developer Focus" }];

    if (user.role === "MANAGER" || user.role === "ADMIN") {
      items.push({ to: "/manager", label: "Manager Summary" });
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
            ) : null}
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
              <RequireManager>
                <ManagerPage />
              </RequireManager>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminConsolePage />
              </RequireAdmin>
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

function RequireManager({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return <Navigate to="/" replace />;
  }
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return children;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
}
