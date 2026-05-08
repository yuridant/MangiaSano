import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

function AccountContent({ embedded = false }: { embedded?: boolean }) {
  const { token, user, families, logout, setActiveFamilyId, activeFamilyId, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [editingProfile, setEditingProfile] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string }) =>
      api.patch("/auth/profile", data, token!),
    onSuccess: async () => {
      await refreshSession();
      setEditingProfile(false);
      setProfileError("");
      setProfileSuccess("Profilo aggiornato.");
      setTimeout(() => setProfileSuccess(""), 3000);
    },
    onError: (err) => setProfileError(err instanceof Error ? err.message : "Errore")
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post("/auth/change-password", data, token!),
    onSuccess: () => {
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError("");
      setPasswordSuccess("");
      window.sessionStorage.setItem("mangiasano.loginMessage", "password-changed");
      logout();
      navigate("/login", { replace: true });
    },
    onError: (err) => setPasswordError(err instanceof Error ? err.message : "Errore")
  });

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      {!embedded && (
        <div className="app-page-header">
          <h1 className="text-2xl font-bold text-ink">Account</h1>
        </div>
      )}

      {/* Profile */}
      <div className="app-panel">
        <h2 className="mb-4 font-bold text-ink">Profilo</h2>

        {editingProfile ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              profileMutation.mutate({ name: name || undefined });
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome visualizzato"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            {profileError && <p className="text-sm text-rose-600">{profileError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setEditingProfile(false); setName(user.name ?? ""); setProfileError(""); }}
                className="app-btn-sm app-btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="app-btn-sm app-btn-sage flex-1 disabled:opacity-60"
              >
                Salva
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              {user.name && <p className="font-bold text-ink">{user.name}</p>}
              <p className={`text-sm ${user.name ? "text-slate-400" : "font-medium text-ink"}`}>
                {user.email}
              </p>
            </div>
            <button
              onClick={() => { setName(user.name ?? ""); setEditingProfile(true); }}
              className="text-xs text-slate-400 hover:text-ink"
              type="button"
            >
              Modifica
            </button>
          </div>
        )}

        {profileSuccess && (
          <p className="mt-3 text-sm text-herb">{profileSuccess}</p>
        )}
      </div>

      {/* Change password */}
      <div className="app-panel">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-ink">Password</h2>
          {!changingPassword && (
            <button
              onClick={() => setChangingPassword(true)}
              className="text-xs text-slate-400 hover:text-ink"
              type="button"
            >
              Cambia
            </button>
          )}
        </div>

        {changingPassword && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              passwordMutation.mutate({ currentPassword, newPassword });
            }}
            className="mt-4 flex flex-col gap-3"
          >
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Password attuale"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Nuova password (min. 8 caratteri)"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            {passwordError && <p className="text-sm text-rose-600">{passwordError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setChangingPassword(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setPasswordError("");
                }}
                className="app-btn-sm app-btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="app-btn-sm app-btn-sage flex-1 disabled:opacity-60"
              >
                {passwordMutation.isPending ? "..." : "Aggiorna"}
              </button>
            </div>
          </form>
        )}

        {passwordSuccess && (
          <p className="mt-3 text-sm text-herb">{passwordSuccess}</p>
        )}
      </div>

      {/* Active family selector */}
      {families.length > 1 && (
        <div className="app-panel">
          <h2 className="mb-4 font-bold text-ink">Famiglia attiva</h2>
          <div className="flex flex-col gap-2">
            {families.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFamilyId(f.id)}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors ${
                  f.id === activeFamilyId
                    ? "bg-sage/10 text-sage"
                    : "bg-slate-50/80 text-ink hover:bg-slate-100/80"
                }`}
              >
                <span className="font-medium">{f.name}</span>
                {f.id === activeFamilyId && (
                  <span className="text-xs font-semibold">Attiva</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="app-panel">
        <button
          onClick={logout}
          className="app-btn-sm app-btn-danger w-full"
          type="button"
        >
          Esci dall'account
        </button>
      </div>
    </div>
  );
}

export function AccountSettingsSection() {
  return <AccountContent embedded />;
}

export function AccountPage() {
  return <AccountContent />;
}
