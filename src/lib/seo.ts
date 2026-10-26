import { site } from "@/data/site";

// Site-wide <title> + meta description, set by root.tsx's `meta` export.
// Routes without their own `meta` inherit these; a route that has one
// (service pages with their own SEO copy) replaces both, so it should fall
// back to this list when it has nothing page-specific.
export const defaultMeta = [{ title: site.fullName }, { name: "description", content: site.description }];

export function pageMeta(seo: { title: string; description: string } | undefined) {
  return seo ? [{ title: seo.title }, { name: "description", content: seo.description }] : defaultMeta;
}
