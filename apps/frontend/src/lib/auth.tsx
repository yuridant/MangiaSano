import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { Family, User } from "../types";

const STORAGE_KEY = "mangiasano.auth";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  families: Family[];
  activeFamilyId: string | null;
  isReady: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    familyName?: string;
    inviteToken?: string;
  }) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => void;
  setActiveFamilyId: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(token: string) {
  return api.get<{ user: User; families: Family[] }>("/auth/me", token);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [activeFamilyId, setActiveFamilyIdState] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setIsReady(true);
      return;
    }

    const parsed = JSON.parse(saved) as {
      token: string;
      refreshToken: string;
      activeFamilyId: string | null;
    };

    syncSession(parsed.token, parsed.refreshToken, parsed.activeFamilyId)
      .catch(() => window.localStorage.removeItem(STORAGE_KEY))
      .finally(() => setIsReady(true));
  }, []);

  useEffect(() => {
    if (!token) return;
    const refreshToken = window.sessionStorage.getItem(STORAGE_KEY);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, refreshToken, activeFamilyId }));
  }, [activeFamilyId, token]);

  const syncSession = async (
    nextToken: string,
    nextRefreshToken: string,
    preferredFamilyId?: string | null
  ) => {
    const payload = await fetchMe(nextToken).catch(async () => {
      const refreshed = await api.post<{ accessToken: string; refreshToken: string }>("/auth/refresh", {
        refreshToken: nextRefreshToken
      });
      nextToken = refreshed.accessToken;
      nextRefreshToken = refreshed.refreshToken;
      return fetchMe(nextToken);
    });

    setToken(nextToken);
    setUser(payload.user);
    setFamilies(payload.families);
    window.sessionStorage.setItem(STORAGE_KEY, nextRefreshToken);
    setActiveFamilyIdState((current) => {
      const target = preferredFamilyId ?? current;
      if (target && payload.families.some((f) => f.id === target)) return target;
      return payload.families[0]?.id ?? null;
    });
  };

  const logout = () => {
    const refreshToken = window.sessionStorage.getItem(STORAGE_KEY);
    if (refreshToken) {
      void api.post("/auth/logout", { refreshToken }).catch(() => undefined);
    }
    setToken(null);
    setUser(null);
    setFamilies([]);
    setActiveFamilyIdState(null);
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        families,
        activeFamilyId,
        isReady,
        login: async (payload) => {
          const response = await api.post<{ accessToken: string; refreshToken: string }>(
            "/auth/login",
            payload
          );
          await syncSession(response.accessToken, response.refreshToken);
        },
        register: async (payload) => {
          const response = await api.post<{ accessToken: string; refreshToken: string }>(
            "/auth/register",
            payload
          );
          await syncSession(response.accessToken, response.refreshToken);
        },
        refreshSession: async () => {
          if (!token) return;
          const refreshToken = window.sessionStorage.getItem(STORAGE_KEY);
          if (!refreshToken) { logout(); return; }
          await syncSession(token, refreshToken, activeFamilyId);
        },
        logout,
        setActiveFamilyId: setActiveFamilyIdState
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
