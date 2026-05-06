import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface InviteInfo {
  familyName: string;
  email: string;
  role: string;
}

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, token: authToken } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<InviteInfo>(`/auth/invitations/resolve?token=${token}`)
      .then(setInvite)
      .catch(() => setError("Invito non valido o scaduto."));
  }, [token]);

  const handleAccept = async () => {
    if (!authToken || !token) return;
    setLoading(true);
    try {
      await api.post("/auth/invitations/accept", { token }, authToken);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'accettare l'invito");
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="app-panel max-w-sm text-center">
          <p className="text-rose-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="app-panel w-full max-w-sm text-center">
          <h2 className="text-xl font-bold text-ink">Sei stato invitato!</h2>
          <p className="mt-2 text-sm text-slate-500">
            Entra in <strong>{invite.familyName}</strong> su MangiaSano
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <a
              href={`/login?invite=${token}`}
              className="app-btn app-btn-primary w-full"
            >
              Accedi al tuo account
            </a>
            <a
              href={`/register?invite=${token}`}
              className="app-btn app-btn-secondary w-full"
            >
              Crea un account
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="app-panel w-full max-w-sm text-center">
        <h2 className="text-xl font-bold text-ink">Sei stato invitato!</h2>
        <p className="mt-2 text-sm text-slate-500">
          Vuoi unirti alla famiglia <strong>{invite.familyName}</strong>?
        </p>
        <button
          onClick={handleAccept}
          disabled={loading}
          className="app-btn app-btn-sage mt-6 w-full disabled:opacity-60"
        >
          {loading ? "Accettando..." : "Accetta invito"}
        </button>
      </div>
    </div>
  );
}
