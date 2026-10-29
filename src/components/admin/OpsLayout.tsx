import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import clsx from "clsx";
import { UserButton } from "@clerk/react";
import { AdminGate } from "./AdminLayout";
import { AdminRoleContext, useLoadAdminRole } from "../../pages/admin/useAdminRole";
import { NewJobButton } from "../../pages/ops/NewJob";

// The dashboard (redesigned from the prototype Blue Line approved, Oct 2026). Same sign-in, data
// and /api/admin/* endpoints as the previous one (AdminLayout.tsx), kept at /admin/classic as a
// fallback (no link to it any more). The top bar's search drives the Requests list. Matt (limited)
// doesn't see Reports or Settings.

const NAV: { to: string; label: string; icon: string; fullOnly?: boolean }[] = [
  { to: "/admin", label: "Today", icon: "M4 12h4l2-6 4 12 2-6h4" },
  { to: "/admin/requests", label: "Requests", icon: "M3 4h5v16H3zM10 4h5v11h-5zM17 4h4v7h-4z" },
  { to: "/admin/schedule", label: "Schedule", icon: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4" },
  { to: "/admin/reports", label: "Reports", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2", fullOnly: true },
  { to: "/admin/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4", fullOnly: true },
];


export default function OpsLayout() {
  return (
    <AdminGate>
      <OpsShell />
    </AdminGate>
  );
}

function OpsShell() {
  const role = useLoadAdminRole();
  return (
    <AdminRoleContext.Provider value={role}>
      <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="flex flex-wrap items-center gap-4 bg-navy px-4 py-3 text-slate-300 md:sticky md:top-0 md:h-screen md:flex-col md:flex-nowrap md:items-stretch md:gap-6 md:px-4 md:py-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-action" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z" />
                <circle cx="6" cy="17.5" r="1.8" />
                <circle cx="16.5" cy="17.5" r="1.8" />
              </svg>
            </span>
            <span className="leading-tight">
              <b className="block font-display text-[15px] font-black text-white">Blue Line</b>
              <span className="text-[11px] uppercase tracking-widest">Operations</span>
            </span>
          </div>

          <nav className="order-3 flex w-full gap-1 overflow-x-auto md:order-none md:grid" aria-label="Sections">
            {NAV.filter((n) => !n.fullOnly || role === "full").map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/admin"}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-semibold",
                    isActive ? "bg-white/10 text-white shadow-[inset_3px_0_0_var(--color-action)]" : "hover:bg-white/5 hover:text-white",
                  )
                }
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d={n.icon} />
                </svg>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto md:mt-auto md:ml-0 md:flex md:items-center md:gap-2 md:text-xs">
            <UserButton />
            <span className="hidden md:inline">{role === "limited" ? "Limited access" : role === "full" ? "Full access" : ""}</span>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-paper/95 px-4 py-3 backdrop-blur md:px-8">
            <Search />
            <div className="flex-1" />
            <NewJobButton />
          </header>
          <main className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminRoleContext.Provider>
  );
}

/** Find a customer, suburb or reference: shows the matches on Requests (?q=). */
function Search() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onRequests = pathname === "/admin/requests";
  const q = onRequests ? (params.get("q") ?? "") : "";
  return (
    <label className="relative w-full max-w-[380px] sm:w-auto sm:flex-1">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={q}
        onChange={(e) => navigate(`/admin/requests${e.target.value ? `?q=${encodeURIComponent(e.target.value)}` : ""}`, { replace: onRequests })}
        placeholder="Find a customer, suburb or reference"
        aria-label="Find a customer, suburb or reference"
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-2.5 pl-8 text-sm"
      />
    </label>
  );
}
