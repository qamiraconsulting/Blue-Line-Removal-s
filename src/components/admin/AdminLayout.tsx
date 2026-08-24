import { Outlet } from "react-router";
import { ClerkProvider, SignIn } from "@clerk/react-router";
// @clerk/react-router's own type exports don't surface Show/UserButton
// (even though it wraps @clerk/react, which has them) -- importing
// directly from @clerk/react instead. Confirmed safe: @clerk/react-router
// re-exports SignIn/UserProfile/etc. by importing those exact same
// components from @clerk/react internally, so mixing sources here isn't
// mixing implementations.
import { Show, UserButton } from "@clerk/react";

// Isolated to the /admin route subtree only -- the public site's Layout.tsx
// never loads Clerk's bundle, keeping it off the customer-facing pages
// entirely. The customer chat stays deliberately login-free; this gate is
// for Blue Line's own team reviewing escalated leads (Phase 3, pulled
// forward per Ayesha's 2026-08-23 request).
//
// This is a UX gate, not the real security boundary -- the site is
// ssr:false (see react-router.config.ts), so there's no per-request
// server to block access before HTML ships. The actual boundary is
// requireAdminAuth() on every /api/admin/* handler, verifying the Clerk
// session token server-side regardless of what this component shows.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export default function AdminLayout() {
  if (!publishableKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
        <div>
          <h1 className="font-display text-xl font-bold text-navy">Dashboard not configured yet</h1>
          <p className="mt-2 text-sm text-slate-600">VITE_CLERK_PUBLISHABLE_KEY isn't set.</p>
        </div>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <Show when="signed-out">
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <SignIn />
        </div>
      </Show>
      <Show when="signed-in">
        <div className="min-h-screen bg-slate-50">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <h1 className="font-display text-lg font-bold text-navy">Blue Line Removals -- Lead Review</h1>
            <UserButton />
          </header>
          <main className="mx-auto max-w-4xl px-6 py-8">
            <Outlet />
          </main>
        </div>
      </Show>
    </ClerkProvider>
  );
}
