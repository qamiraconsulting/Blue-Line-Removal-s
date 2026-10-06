import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { useEffect } from "react";
import { site } from "@/data/site";
import { GTM_ID, gtmHeadScript, trackContactLinkClicks, trackingEnabled } from "@/lib/analytics";
import "./index.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
        <link rel="apple-touch-icon" href="/favicon-192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={site.description} />
        <title>{site.fullName}</title>
        {trackingEnabled && <script dangerouslySetInnerHTML={{ __html: gtmHeadScript }} />}
        <Meta />
        <Links />
      </head>
      <body>
        {trackingEnabled && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  useEffect(() => trackContactLinkClicks(), []);

  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error) && error.status === 404 ? "Page not found." : "Something went wrong.";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="font-display text-2xl font-bold text-navy">{message}</h1>
      <a href="/" className="text-sm font-bold text-action hover:underline">
        Back to home
      </a>
    </div>
  );
}
