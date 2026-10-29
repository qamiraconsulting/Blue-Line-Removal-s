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
  // Internal lead-review dashboard -- not in the public site's Layout,
  // not linked from any nav, and not in react-router.config.ts's
  // prerender list, so it's served client-side-only via vercel.json's
  // SPA fallback rather than baked into a static file at build time.
  layout("components/admin/AdminLayout.tsx", [
    route("admin", "pages/admin/Dashboard.tsx"),
    route("admin/overview", "pages/admin/Overview.tsx"),
    route("admin/conversations/:id", "pages/admin/ConversationDetail.tsx"),
    route("admin/capacity", "pages/admin/Capacity.tsx"),
    route("admin/trips", "pages/admin/TruckTrips.tsx"),
  ]),
  // The redesigned dashboard (Blue Line approved the prototype), built beside the current one
  // on the test link so either can be used until Ayesha signs off; then it moves to /admin.
  layout("components/admin/OpsLayout.tsx", [
    route("admin/new", "pages/ops/Today.tsx"),
    route("admin/new/requests", "pages/ops/Requests.tsx"),
    route("admin/new/chat/:id", "pages/admin/ConversationDetail.tsx", { id: "ops-chat" }),
  ]),
] satisfies RouteConfig;
