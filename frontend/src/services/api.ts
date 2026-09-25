import type { AppUser } from "../types/session";
import type { UpstoxProfileResponse } from "../types/auth";

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error("VITE_API_URL is not configured");
}

/** Error that remembers the HTTP status, so callers can react to 401/404. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function readDetail(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null || !("detail" in data))
    return fallback;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: [{ msg: "..." }]
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg.replace(/^Value error, /, "");
  }
  return fallback;
}

/**
 * Every call sends the session cookie (credentials: "include").
 * React never sees the cookie or any broker token.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  fallback = "Request failed",
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  let data: unknown = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(readDetail(data, fallback), response.status);
  }

  return data as T;
}

/* ---------- Algoverve account ---------- */

/** Returns the signed-in user, or null if nobody is signed in. */
export async function getMe(): Promise<AppUser | null> {
  try {
    return await request<AppUser>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function signIn(email: string, password: string): Promise<AppUser> {
  return request<AppUser>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    "Couldn’t sign in",
  );
}

export function signUp(
  name: string,
  email: string,
  password: string,
): Promise<AppUser> {
  return request<AppUser>(
    "/auth/signup",
    { method: "POST", body: JSON.stringify({ name, email, password }) },
    "Couldn’t create your account",
  );
}

export async function signOut(): Promise<void> {
  await request<null>("/auth/logout", { method: "POST" }, "Couldn’t sign out");
}

/* ---------- Upstox (broker) ---------- */

/** Returns the Upstox profile, or null if Upstox isn't connected yet. */
export async function getUserProfile(): Promise<UpstoxProfileResponse | null> {
  try {
    return await request<UpstoxProfileResponse>(
      "/brokers/upstox/profile",
      {},
      "Unable to fetch Upstox profile",
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Full-page redirect: FastAPI → Upstox login → back to React. */
export function loginWithUpstox(): void {
  window.location.href = `${API_URL}/brokers/upstox/connect`;
}

export async function logoutUpstox(): Promise<void> {
  await request<unknown>(
    "/brokers/upstox",
    { method: "DELETE" },
    "Couldn’t disconnect Upstox",
  );
}
