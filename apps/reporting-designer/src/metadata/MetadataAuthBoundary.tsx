import { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";

const BRAND_NAME = import.meta.env.VITE_APP_BRAND ?? "Nucleus Metadata Console";

export function MetadataAuthBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.phase === "boot" || auth.phase === "checking" || auth.phase === "authenticating") {
    return <AuthLoading phase={auth.phase} attempt={auth.autoAttempts} />;
  }

  if (!auth.user || auth.phase !== "authenticated") {
    return (
      <MetadataAuthGate
        brandName={BRAND_NAME}
        phase={auth.phase}
        hasKeycloak={auth.hasKeycloak}
        onSignIn={() => auth.login()}
        autoAttempts={auth.autoAttempts}
        maxAutoAttempts={auth.maxAutoAttempts}
        error={auth.error}
      />
    );
  }

  return <>{children}</>;
}

function MetadataAuthGate({
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-8 text-slate-50">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/80 p-10 shadow-2xl shadow-slate-900/60 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{brandName}</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Launch the metadata workspace</h1>
        <p className="mt-3 text-sm text-slate-300">
          Authenticate via Keycloak so we can load tenants, projects, and endpoint permissions.
        </p>
        {!hasKeycloak ? (
          <div className="mt-6 rounded-2xl border border-amber-500/60 bg-amber-500/10 p-4 text-sm text-amber-200">
            Missing `VITE_KEYCLOAK_*` env vars. Update your metadata designer `.env` and restart `pnpm dev`.
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            disabled={phase === "authenticating"}
            className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-white/95 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {phase === "authenticating" ? "Opening Keycloak…" : "Continue with Keycloak"}
          </button>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Auto-login attempts used: {autoAttempts}/{maxAutoAttempts} {attemptsLeft === 0 ? "— click above to retry." : null}
        </p>
        {showTroubleshooting ? (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-left text-sm">
            <p className="font-semibold text-slate-200">Troubleshooting</p>
            <p className="mt-1 text-slate-400">{error ?? "Unknown error"}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AuthLoading({ phase, attempt }: { phase: string; attempt: number }) {
  const message = phase === "authenticating" ? "Opening Keycloak…" : "Checking your session…";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-300">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 px-8 py-6 text-center shadow-lg">
        <p className="text-sm">{message}</p>
        {attempt > 0 ? <p className="mt-2 text-xs text-slate-500">Auto-login attempts: {attempt}</p> : null}
      </div>
    </div>
  );
}
