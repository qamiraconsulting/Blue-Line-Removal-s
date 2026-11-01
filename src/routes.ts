import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("components/layout/Layout.tsx", [
    index("pages/Home.tsx"),
    route("services", "pages/Services.tsx"),
    route("services/:slug", "pages/ServiceDetail.tsx"),
    route("quote", "pages/Quote.tsx"),
    route("faq", "pages/FAQ.tsx"),
    route("privacy", "pages/Privacy.tsx"),
    route("deposit", "pages/Deposit.tsx"),
  ]),
  // The internal dashboard -- not in the public site's Layout, not linked from any nav, and not
  // in react-router.config.ts's prerender list, so it's served client-side-only via vercel.json's
  // SPA fallback rather than baked into a static file at build time.
  // The redesigned dashboard (Blue Line approved the prototype; Ayesha signed off 30 Oct 2026).
  layout("components/admin/OpsLayout.tsx", [
    route("admin", "pages/ops/Today.tsx"),
    route("admin/requests", "pages/ops/Requests.tsx"),
    route("admin/jobs/:ref", "pages/ops/Job.tsx"),
    route("admin/schedule", "pages/ops/Schedule.tsx"),
    route("admin/reports", "pages/ops/Reports.tsx"),
    route("admin/settings", "pages/ops/Settings.tsx"),
    route("admin/chat/:id", "pages/admin/ConversationDetail.tsx", { id: "ops-chat" }),
  ]),
  // The previous dashboard, kept as a fallback for now.
  layout("components/admin/AdminLayout.tsx", [
    route("admin/classic", "pages/admin/Dashboard.tsx"),
    route("admin/classic/overview", "pages/admin/Overview.tsx"),
    route("admin/classic/conversations/:id", "pages/admin/ConversationDetail.tsx"),
    route("admin/classic/capacity", "pages/admin/Capacity.tsx"),
    route("admin/classic/trips", "pages/admin/TruckTrips.tsx"),
  ]),
  // Old addresses (bookmarks, links in emails already sent) -> their new pages.
  route("admin/new/*", "pages/ops/Moved.tsx", { id: "moved-new" }),
  route("admin/trips", "pages/ops/Moved.tsx", { id: "moved-trips" }),
  route("admin/overview", "pages/ops/Moved.tsx", { id: "moved-overview" }),
  route("admin/capacity", "pages/ops/Moved.tsx", { id: "moved-capacity" }),
  route("admin/conversations/:id", "pages/ops/Moved.tsx", { id: "moved-chat" }),
] satisfies RouteConfig;
