import { useAuth } from "@clerk/react-router";

// Attaches the current Clerk session token as a Bearer header -- every
// /api/admin/* handler verifies this server-side via requireAdminAuth().
export function useAdminApi() {
  const { getToken } = useAuth();

  async function adminFetch(path: string, init?: RequestInit) {
    const token = await getToken();
    return fetch(path, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  }

  return { adminFetch };
}
