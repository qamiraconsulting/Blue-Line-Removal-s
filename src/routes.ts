import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("components/layout/Layout.tsx", [
    index("pages/Home.tsx"),
    route("services", "pages/Services.tsx"),
    route("services/:slug", "pages/ServiceDetail.tsx"),
    route("quote", "pages/Quote.tsx"),
    route("faq", "pages/FAQ.tsx"),
  ]),
  // Internal lead-review dashboard -- not in the public site's Layout,
  // not linked from any nav, and not in react-router.config.ts's
  // prerender list, so it's served client-side-only via vercel.json's
  // SPA fallback rather than baked into a static file at build time.
  layout("components/admin/AdminLayout.tsx", [
    route("admin", "pages/admin/Dashboard.tsx"),
    route("admin/conversations/:id", "pages/admin/ConversationDetail.tsx"),
  ]),
] satisfies RouteConfig;
