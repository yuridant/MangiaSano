import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, login, isReady } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [persistedMessage, setPersistedMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextMessage = window.sessionStorage.getItem("mangiasano.loginMessage");
    if (!nextMessage) return;
    setPersistedMessage(nextMessage);
    window.sessionStorage.removeItem("mangiasano.loginMessage");
  }, []);

  if (isReady && user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di accesso");
    } finally {
      setLoading(false);
    }
  };

  const inviteToken = searchParams.get("invite");
  const shouldShowPasswordChangedMessage =
    searchParams.get("message") === "password-changed" || persistedMessage === "password-changed";
  const infoMessage = shouldShowPasswordChangedMessage
    ? "Password aggiornata. Accedi di nuovo per continuare."
    : "";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-ink">MangiaSano</h1>
          <p className="mt-2 text-sm text-slate-500">Accedi al tuo account</p>
        </div>

        <div className="app-panel">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {infoMessage && (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {infoMessage}
              </p>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
                placeholder="tu@esempio.it"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                minLength={8}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="app-btn app-btn-primary mt-2 w-full disabled:opacity-60"
            >
              {loading ? "Accesso in corso..." : "Accedi"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Non hai un account?{" "}
          <Link
            to={inviteToken ? `/register?invite=${inviteToken}` : "/register"}
            className="font-semibold text-sage hover:underline"
          >
            Registrati
          </Link>
        </p>
      </div>
    </div>
  );
}
