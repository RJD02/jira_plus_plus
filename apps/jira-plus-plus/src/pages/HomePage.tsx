import { ArrowRight, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../providers/AuthProvider";

export function HomePage() {
  const { user, login, phase, hasKeycloak } = useAuth();
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/95 p-10 shadow-2xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-slate-950/60">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-500/30" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-cyan-200/20 blur-3xl dark:bg-cyan-500/20" />
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                <Sparkles className="h-4 w-4 text-sky-500 dark:text-sky-300" />
                AI Native Scrum Intelligence
              </span>
              <h2 className="text-4xl font-semibold leading-tight md:text-5xl">
                Stand-ups that actually move the sprint forward.
              </h2>
              <p className="max-w-2xl text-base text-slate-600 md:text-lg dark:text-slate-300">
                Jira++ synthesizes worklogs, comments, and Jira issues into crisp daily narratives. Spot blockers, highlight wins, and keep every stakeholder aligned in minutes.
              </p>
            </div>
            <dl className="grid gap-6 md:grid-cols-2">
              <Feature
                icon={<ShieldCheck className="h-5 w-5 text-emerald-500 dark:text-emerald-300" />}
                title="Enterprise-grade security"
                description="Secrets encrypted with AES-256-GCM, JWT-based sessions, and admin-first provisioning keep your data safe."
              />
              <Feature
                icon={<Workflow className="h-5 w-5 text-sky-600 dark:text-sky-300" />}
                title="Cross-project visibility"
                description="Map team members across multiple Jira sites and understand impact from a single control center."
              />
            </dl>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/scrum"
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Explore daily boards
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/manager"
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-900"
              >
                View manager insights
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          {user ? (
            <SignedInCard name={user.displayName} email={user.email} />
          ) : (
            <SignInCard
              phase={phase}
              canSignIn={hasKeycloak}
              onSignIn={() => void login()}
            />
          )}
        </div>
      </section>
      <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-slate-950/50">
        <h3 className="text-2xl font-semibold">Bring order to hybrid and remote delivery</h3>
        <p className="max-w-3xl text-base text-slate-600 dark:text-slate-300">
          Jira++ pairs AI summarization with explicit human-approved workflows. Admins stay in control with the new console, provisioning teams, connecting Jira sites, and mapping accounts without touching a CLI.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map((highlight) => (
            <div
              key={highlight.title}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-md shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-950/60 dark:shadow-slate-950/40"
            >
              <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {highlight.title}
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">{highlight.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface FeatureProps {
  icon: ReactNode;
  title: string;
  description: string;
}

function Feature({ icon, title, description }: FeatureProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60 dark:shadow-slate-950/40">
      <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {icon}
        {title}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}

const highlights = [
  {
    title: "Jira site registry",
    description:
      "Connect multiple cloud or server-based Jira instances with encrypted credentials and health monitoring.",
  },
  {
    title: "Project intake controls",
    description:
      "Select the projects that matter, archive stale workstreams, and keep sprint intelligence noise-free.",
  },
  {
    title: "Account mapping",
    description:
      "Associate Jira account IDs with your Jira++ workspace to unlock cross-project analytics and coaching insights.",
  },
];

function SignInCard({
  onSignIn,
  phase,
  canSignIn,
}: {
  onSignIn: () => void;
  phase: string;
  canSignIn: boolean;
}) {
  return (
    <div className="flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-slate-900/90 p-8 text-white shadow-2xl shadow-slate-900/40 dark:border-slate-800 dark:bg-slate-800/80">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Get started</p>
        <h3 className="text-2xl font-semibold">Sign in to connect your Jira sources</h3>
        <p className="text-sm text-slate-200">
          Keycloak handles authentication so every request carries tenant and project context automatically.
        </p>
        {!canSignIn ? (
          <p className="text-xs text-rose-200">
            Missing `VITE_KEYCLOAK_*` env vars. Update your `.env` and restart the dev server to enable sign-in.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSignIn}
        disabled={!canSignIn || phase === "checking" || phase === "authenticating"}
        className="mt-10 inline-flex items-center justify-center rounded-full bg-white/95 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {phase === "checking" || phase === "authenticating" ? "Connecting…" : canSignIn ? "Sign in with Keycloak" : "Configure auth to continue"}
      </button>
    </div>
  );
}

function SignedInCard({ name, email }: { name: string; email: string }) {
  return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-8 shadow-inner shadow-emerald-200/60 dark:border-emerald-500/40 dark:bg-emerald-900/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Signed in</p>
      <h3 className="mt-2 text-2xl font-semibold text-emerald-800 dark:text-emerald-100">{name}</h3>
      <p className="text-sm text-emerald-700 dark:text-emerald-200">{email}</p>
      <p className="mt-4 text-sm text-emerald-700/80 dark:text-emerald-200/80">
        You can jump directly into the console modules without re-authenticating. Tokens refresh automatically while this tab remains open.
      </p>
    </div>
  );
}
