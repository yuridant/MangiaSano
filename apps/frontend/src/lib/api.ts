const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

let authRuntime: {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
  onAuthFailure: () => void;
} | null = null;

function buildApiUrl(path: string) {
  return `${API_URL}/api${path.startsWith("/") ? path : `/${path}`}`;
}

function buildHeaders(token?: string, headers?: HeadersInit) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers
  };
}

async function parseResponseBody(response: Response) {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function performRequest(path: string, options: RequestInit = {}, token?: string) {
  return fetch(buildApiUrl(path), {
    ...options,
    headers: buildHeaders(token, options.headers)
  });
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let effectiveToken = token;
  let response = await performRequest(path, options, effectiveToken);

  if (response.status === 401 && authRuntime && effectiveToken) {
    const refreshedToken = await authRuntime.refreshAccessToken();
    if (refreshedToken) {
      effectiveToken = refreshedToken;
      response = await performRequest(path, options, effectiveToken);
    } else {
      authRuntime.onAuthFailure();
    }
  }

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
      throw new Error(payload.message);
    }
    if (typeof payload === "string" && payload.trim()) {
      throw new Error(payload);
    }
    throw new Error("Request failed");
  }

  return payload as T;
}

export const api = {
  configureAuth: (runtime: typeof authRuntime) => {
    authRuntime = runtime;
  },
  buildUrl: buildApiUrl,
  get: <T>(path: string, token?: string) => request<T>(path, {}, token),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, token),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, token),
  delete: <T>(path: string, token?: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", ...(body ? { body: JSON.stringify(body) } : {}) }, token)
};
