import { Navigate, useLocation } from "react-router";

// Old dashboard addresses -- bookmarks and links in emails already sent -- go to their pages on
// the dashboard: /admin/trips -> Schedule, /admin/overview -> Reports, /admin/capacity ->
// Settings, /admin/conversations/:id -> the chat, /admin/new/... -> /admin/... (the address the
// new dashboard had while it was being built).

const MOVED: [RegExp, string][] = [
  [/^\/admin\/new(\/|$)/, "/admin$1"],
  [/^\/admin\/trips\/?$/, "/admin/schedule"],
  [/^\/admin\/overview\/?$/, "/admin/reports"],
  [/^\/admin\/capacity\/?$/, "/admin/settings"],
  [/^\/admin\/conversations\//, "/admin/chat/"],
];

export default function Moved() {
  const { pathname, search } = useLocation();
  const to = MOVED.reduce((path, [from, into]) => path.replace(from, into), pathname);
  return <Navigate to={`${to}${search}`} replace />;
}
