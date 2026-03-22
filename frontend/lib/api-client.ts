import { ERROR_MESSAGES } from "./error-messages";

function resolveBaseUrl(): string {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (typeof window === "undefined") {
    return envBaseUrl ?? "http://localhost:4000/api";
  }

  const browserHost = window.location.hostname;

  if (!envBaseUrl) {
    return "/api";
  }

  const isLocalEnvBase = envBaseUrl.includes("localhost") || envBaseUrl.includes("127.0.0.1");
  if (isLocalEnvBase && browserHost !== "localhost" && browserHost !== "127.0.0.1") {
    return "/api";
  }

  return envBaseUrl;
}

interface ApiErrorShape {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function getToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("token");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = resolveBaseUrl();
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined)
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const response = await fetch(baseUrl + path, {
    ...init,
    headers,
    cache: "no-store"
  });

  const payload = (await response.json()) as { success: boolean; data?: T } | ApiErrorShape;

  if (!response.ok || !payload.success) {
    const errorCode = (payload as ApiErrorShape).error?.code ?? "INTERNAL_ERROR";
    const fallback = (payload as ApiErrorShape).error?.message ?? "Request failed";
    const message = ERROR_MESSAGES[errorCode] ?? fallback;
    throw new Error(message);
  }

  return payload.data as T;
}

export const apiClient = {
  get<T>(path: string) {
    return request<T>(path, { method: "GET" });
  },
  post<T>(path: string, body: unknown) {
    return request<T>(path, {
      method: "POST",
      body: JSON.stringify(body)
    });
  },
  patch<T>(path: string, body: unknown) {
    return request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
  },
  delete<T>(path: string) {
    return request<T>(path, { method: "DELETE" });
  }
};
