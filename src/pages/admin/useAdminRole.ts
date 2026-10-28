import { createContext, useContext, useEffect, useState } from "react";
import { useAdminApi } from "./useAdminApi";

// Full users see every tab; limited users (Matt, Blue Line 28 Oct) don't see Settings.
// The server enforces it too (api/admin/capacity.ts) -- this only keeps the screens tidy.
export type AdminRole = "full" | "limited";

/** null while loading, or when the account isn't allowed in (the pages show that error). */
export const AdminRoleContext = createContext<AdminRole | null>(null);
export const useAdminRole = () => useContext(AdminRoleContext);

export function useLoadAdminRole(): AdminRole | null {
  const { adminFetch } = useAdminApi();
  const [role, setRole] = useState<AdminRole | null>(null);
  useEffect(() => {
    let live = true;
    adminFetch("/api/admin/leads?me=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { role?: AdminRole } | null) => live && d?.role && setRole(d.role))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per sign-in
  }, []);
  return role;
}
