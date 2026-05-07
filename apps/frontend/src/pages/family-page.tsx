import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Family, FamilyDetail } from "../types";

export function FamilyPage() {
  const { token, activeFamilyId, user, refreshSession } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [allergyNotes, setAllergyNotes] = useState("");
  const [intoleranceNotes, setIntoleranceNotes] = useState("");
  const [preferenceNotes, setPreferenceNotes] = useState("");
  const [nameError, setNameError] = useState("");
  const [newFamilyName, setNewFamilyName] = useState("");
  const [createError, setCreateError] = useState("");

  const familyQuery = useQuery({
    queryKey: ["family", activeFamilyId],
    queryFn: () => api.get<FamilyDetail>(`/families/${activeFamilyId}`, token!),
    enabled: !!token && !!activeFamilyId
  });

  const updateFamilyMutation = useMutation({
    mutationFn: (payload: {
      name?: string;
      allergyNotes?: string;
      intoleranceNotes?: string;
      preferenceNotes?: string;
    }) =>
      api.patch<Family>(`/families/${activeFamilyId}`, payload, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family", activeFamilyId] });
      setEditingName(false);
      setNameError("");
    },
    onError: (err) => setNameError(err instanceof Error ? err.message : "Errore")
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) =>
      api.post(`/families/${activeFamilyId}/invitations`, { email }, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family", activeFamilyId] });
      setInviteEmail("");
      setInviteError("");
      setInviteSuccess("Invito inviato con successo.");
      setTimeout(() => setInviteSuccess(""), 4000);
    },
    onError: (err) => {
      setInviteError(err instanceof Error ? err.message : "Errore");
      setInviteSuccess("");
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/families/${activeFamilyId}/members/${userId}`, token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["family", activeFamilyId] })
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (inviteId: string) =>
      api.delete(`/families/${activeFamilyId}/invitations/${inviteId}`, token!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["family", activeFamilyId] })
  });

  const createFamilyMutation = useMutation({
    mutationFn: (name: string) => api.post<Family>("/families", { name }, token!),
    onSuccess: async () => {
      await refreshSession();
      setNewFamilyName("");
      setCreateError("");
    },
    onError: (err) => setCreateError(err instanceof Error ? err.message : "Errore")
  });

  const family = familyQuery.data;
  const currentMember = family?.members.find((m) => m.email === user?.email);
  const isOwner = currentMember?.role === "owner";
  const pendingInvitations = family?.pendingInvitations ?? [];

  if (familyQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sage border-t-transparent" />
      </div>
    );
  }

  if (!activeFamilyId) {
    return (
      <div className="flex flex-col gap-5">
        <div className="app-page-header">
          <h1 className="text-2xl font-bold text-ink">Famiglia</h1>
        </div>
        <div className="app-panel">
          <h2 className="mb-2 font-bold text-ink">Crea la tua famiglia</h2>
          <p className="mb-4 text-sm text-slate-500">
            Non sei ancora associato a nessuna famiglia. Creane una per iniziare.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createFamilyMutation.mutate(newFamilyName);
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="text"
              value={newFamilyName}
              onChange={(e) => setNewFamilyName(e.target.value)}
              required
              placeholder="Nome famiglia (es. Famiglia Rossi)"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            {createError && <p className="text-sm text-rose-600">{createError}</p>}
            <button
              type="submit"
              disabled={createFamilyMutation.isPending}
              className="app-btn-sm app-btn-sage disabled:opacity-60"
            >
              {createFamilyMutation.isPending ? "Creazione..." : "Crea famiglia"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!family) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="app-page-header">
        <h1 className="text-2xl font-bold text-ink">Famiglia</h1>
      </div>

      {/* Family name */}
      <div className="app-panel">
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateFamilyMutation.mutate({
                name: familyName,
                allergyNotes,
                intoleranceNotes,
                preferenceNotes
              });
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              required
              placeholder="Nome famiglia"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            <textarea
              value={allergyNotes}
              onChange={(e) => setAllergyNotes(e.target.value)}
              rows={3}
              placeholder="Allergie da evitare (es. arachidi, crostacei)"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none resize-none"
            />
            <textarea
              value={intoleranceNotes}
              onChange={(e) => setIntoleranceNotes(e.target.value)}
              rows={3}
              placeholder="Intolleranze o limiti alimentari (es. lattosio, glutine)"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none resize-none"
            />
            <textarea
              value={preferenceNotes}
              onChange={(e) => setPreferenceNotes(e.target.value)}
              rows={3}
              placeholder="Preferenze (es. più legumi, meno carne rossa, piatti veloci)"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none resize-none"
            />
            {nameError && <p className="text-sm text-rose-600">{nameError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setEditingName(false); setNameError(""); }}
                className="app-btn-sm app-btn-secondary flex-1"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={updateFamilyMutation.isPending}
                className="app-btn-sm app-btn-sage flex-1 disabled:opacity-60"
              >
                Salva
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nome famiglia</p>
              <p className="mt-1 text-lg font-bold text-ink">{family.name}</p>
            </div>
            {isOwner && (
              <button
                onClick={() => {
                  setFamilyName(family.name);
                  setAllergyNotes(family.allergyNotes ?? "");
                  setIntoleranceNotes(family.intoleranceNotes ?? "");
                  setPreferenceNotes(family.preferenceNotes ?? "");
                  setEditingName(true);
                }}
                className="text-xs text-slate-400 hover:text-ink"
                type="button"
              >
                Modifica
              </button>
            )}
          </div>
        )}
      </div>

      <div className="app-panel">
        <h2 className="mb-4 font-bold text-ink">Profilo alimentare</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Allergie</p>
            <p className="mt-2 text-sm text-ink">{family.allergyNotes || "Nessuna informazione inserita."}</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Intolleranze</p>
            <p className="mt-2 text-sm text-ink">{family.intoleranceNotes || "Nessuna informazione inserita."}</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Preferenze</p>
            <p className="mt-2 text-sm text-ink">{family.preferenceNotes || "Nessuna informazione inserita."}</p>
          </div>
        </div>
        {isOwner && (
          <p className="mt-4 text-xs text-slate-500">
            Queste informazioni vengono passate anche all&apos;AI quando generi il menu.
          </p>
        )}
      </div>

      {/* Members */}
      <div className="app-panel">
        <h2 className="mb-4 font-bold text-ink">Membri ({family.members.length})</h2>
        <div className="flex flex-col gap-2">
          {family.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3"
            >
              <div>
                <p className="font-medium text-ink">{m.name ?? m.email}</p>
                {m.name && (
                  <p className="text-xs text-slate-400">{m.email}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`app-badge ${m.role === "owner" ? "app-badge-sage" : ""}`}>
                  {m.role === "owner" ? "Proprietario" : "Membro"}
                </span>
                {isOwner && m.email !== user?.email && (
                  <button
                    onClick={() => removeMemberMutation.mutate(m.id)}
                    className="text-xs text-rose-400 hover:text-rose-600"
                    type="button"
                  >
                    Rimuovi
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite form (owner only) */}
      {isOwner && (
        <div className="app-panel">
          <h2 className="mb-4 font-bold text-ink">Invita un membro</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setInviteError("");
              inviteMutation.mutate(inviteEmail);
            }}
            className="flex flex-col gap-3"
          >
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="Email del membro da invitare"
              className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm focus:border-sage focus:outline-none"
            />
            {inviteError && <p className="text-sm text-rose-600">{inviteError}</p>}
            {inviteSuccess && <p className="text-sm text-herb">{inviteSuccess}</p>}
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="app-btn-sm app-btn-sage disabled:opacity-60"
            >
              {inviteMutation.isPending ? "Invio..." : "Invia invito"}
            </button>
          </form>
        </div>
      )}

      {/* Pending invitations */}
      {isOwner && pendingInvitations.length > 0 && (
        <div className="app-panel">
          <h2 className="mb-4 font-bold text-ink">Inviti in attesa</h2>
          <div className="flex flex-col gap-2">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-2xl bg-slate-50/80 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-ink">{inv.email}</p>
                  <p className="text-xs text-slate-400">
                    Scade il {new Date(inv.expiresAt).toLocaleDateString("it-IT")}
                  </p>
                </div>
                <button
                  onClick={() => cancelInviteMutation.mutate(inv.id)}
                  className="text-xs text-rose-400 hover:text-rose-600"
                  type="button"
                >
                  Annulla
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
