// Google Tag Manager container for bluelineremovals.com.au. GA4, Google Ads
// and the Meta Pixel are all configured inside GTM, not in this codebase --
// the site only loads the container and pushes named events to it.
export const GTM_ID = "GTM-TVHBZC4Q";

// Only production builds load GTM, so `npm run dev` sessions don't show up
// as real visitors in Analytics or as conversions in Ads.
export const trackingEnabled = import.meta.env.PROD;

export const gtmHeadScript = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

// Event names here are what the GTM triggers listen for -- renaming one
// means updating the matching Custom Event trigger in GTM too.
export type TrackedEvent = "quote_submitted" | "callback_requested" | "phone_click" | "email_click";

export function trackEvent(event: TrackedEvent, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...params });
}

// One document-level listener covers every tel:/mailto: link on the site
// (hero, contact widget, footer, quote CTA, and any added later) instead of
// wiring an onClick into each component.
export function trackContactLinkClicks() {
  function onClick(e: MouseEvent) {
    const link = (e.target as Element | null)?.closest?.("a[href^='tel:'], a[href^='mailto:']");
    if (!link) return;
    const href = link.getAttribute("href") ?? "";
    trackEvent(href.startsWith("tel:") ? "phone_click" : "email_click", {
      link_location: window.location.pathname,
    });
  }
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
