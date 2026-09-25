const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  throw new Error(
    "VITE_API_URL is not configured"
  );
}

/**
 * Fetch the currently connected Upstox user's profile.
 *
 * IMPORTANT:
 * The Upstox access token is never handled by React.
 * FastAPI reads the token from Neon and calls Upstox.
 */
export async function getUserProfile(): Promise<unknown> {
  const response = await fetch(
    `${API_URL}/user/profile`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMessage =
      typeof data === "object" &&
      data !== null &&
      "detail" in data
        ? String(
            (data as { detail?: unknown }).detail ??
              "Unable to fetch Upstox profile"
          )
        : "Unable to fetch Upstox profile";

    throw new Error(errorMessage);
  }

  return data;
}

/**
 * Redirect browser to FastAPI's Upstox login endpoint.
 */
export function loginWithUpstox(): void {
  window.location.href = `${API_URL}/login`;
}